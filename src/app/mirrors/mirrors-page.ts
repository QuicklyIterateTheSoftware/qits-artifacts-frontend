import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QitsButton } from '@qits/ui-components';
import { ArtifactsApi } from '../api/artifacts-api';
import type { MirrorUpstreamDto } from '../api/dto';
import { QITS_REGISTRY_HOST } from '../api/registry-host';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { formatInstant, plural } from '../ui/format';
import { LOADING, failed, ready, statusOf, describeError, type Loadable } from '../ui/loadable';
import {
  clashProblem,
  cleanDomain,
  cleanSlug,
  domainProblem,
  pullPrefix,
  slugProblem,
} from './upstream-rules';

/**
 * The upstream map: which public registries this one mirrors, under which namespace, and what each
 * namespace has actually cached.
 *
 * It exists because the alternative was configuration keys, and a configuration key is invisible.
 * The upstream list decides which registry the cache dials on a miss — the single most consequential
 * fact about the pull-through cache — so it is a table with a page over it, and this is the page.
 *
 * **Load budget: `1 + 0`.** One flat read, `GET /artifacts/api/mirror-upstreams`, and nothing per
 * row: the domain, the namespace, the registration date and the cached-image count all arrive with
 * the row. Nothing here fans out, and the cost does not grow with the number of upstreams.
 *
 * **Each write costs `1 + 0` as well**, and that is a deliberate shape rather than an omission. The
 * `PUT` answers with the row it stored and the `DELETE` answers 204, so the page splices its own
 * list instead of re-reading one it already has. The only figure that could go stale is
 * `cachedImages`, which changes when a *build* pulls something rather than when this page does
 * anything, and Refresh is one press away.
 *
 * **The writes carry no credential, and the page says so when that matters.** No qits SPA has ever
 * sent a machine token; qits-artifacts guards its write surface with a static `X-Artifacts-Token`
 * that a shell or a provisioning script holds. When a deployment sets that token these two buttons
 * answer 401, and the honest response is to name the header and the caller that has it — not to
 * grow a credential store in a browser so the explorer can defeat a guard aimed at browsers.
 *
 * **Remove says what it does not do.** Deleting an upstream removes one row. The namespace's
 * repository row and every cached manifest, tag and blob under it stay on disk and keep serving;
 * what ends is the ability to fetch anything *new* into it. That is the platform's append-only
 * posture, and a confirm step that let someone believe they were reclaiming gigabytes would be the
 * one genuinely dangerous thing this page could do.
 *
 * **The pull prefix is built from the reader's own host.** `/v2` is served at the host root, so the
 * registry answers on whatever address this explorer was reached on; see {@link QITS_REGISTRY_HOST}
 * for why that is printed rather than a deployment constant.
 *
 * The add form is a **local signal**, like every other disclosure in this app: opening it costs no
 * request, so there is nothing to restore from a URL and nothing worth a history entry.
 */
@Component({
  selector: 'app-mirrors-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsButton, RouterLink],
  templateUrl: './mirrors-page.html',
  styleUrls: ['../ui/page.css', './mirrors-page.css'],
})
export class MirrorsPage {
  private readonly api = inject(ArtifactsApi);

  /** The host a pull through this mirror is addressed to — the reader's own. */
  protected readonly registryHost = inject(QITS_REGISTRY_HOST);

  protected readonly formatInstant = formatInstant;

  protected readonly upstreams = signal<Loadable<readonly MirrorUpstreamDto[]>>(LOADING);

  /** The rows, once they are here; an empty list otherwise, so the template stays flat. */
  protected readonly rows = computed(() => {
    const state = this.upstreams();
    return state.kind === 'ready' ? state.value : [];
  });

  /** `3 upstreams` — the map's shape in one clause. */
  protected readonly lede = computed(() => {
    const state = this.upstreams();
    return state.kind === 'ready' ? plural(state.value.length, 'upstream') : '';
  });

  // The add form. Closed until asked for: this page is read far more often than it is written to.
  protected readonly adding = signal(false);
  protected readonly domainInput = signal('');
  protected readonly slugInput = signal('');

  /** The domain awaiting a second press, or null. One row at a time. */
  protected readonly confirming = signal<string | null>(null);

  /** The domain a write is in flight for, or `''` for the add form, or null. */
  protected readonly busy = signal<string | null>(null);

  /** What the last write failed with, said in this page's words. Cleared when one succeeds. */
  protected readonly writeError = signal<string | null>(null);

  protected readonly domainProblem = computed(() =>
    this.domainInput() === '' ? null : domainProblem(this.domainInput()),
  );

  protected readonly slugProblem = computed(() =>
    this.slugInput() === '' ? null : slugProblem(this.slugInput()),
  );

  /** The clash the loaded list can see, once both fields are individually legal. */
  protected readonly clash = computed(() => {
    if (domainProblem(this.domainInput()) || slugProblem(this.slugInput())) {
      return null;
    }
    return clashProblem(this.rows(), this.domainInput(), this.slugInput());
  });

  /** What will actually be sent — the normalisation made visible before it is a surprise. */
  protected readonly preview = computed(() => {
    if (domainProblem(this.domainInput()) || slugProblem(this.slugInput())) {
      return '';
    }
    return pullPrefix(this.registryHost, cleanSlug(this.slugInput()));
  });

  protected readonly submittable = computed(
    () =>
      this.busy() === null &&
      domainProblem(this.domainInput()) === null &&
      slugProblem(this.slugInput()) === null &&
      this.clash() === null,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.upstreams.set(LOADING);
    try {
      this.upstreams.set(ready(await this.api.mirrorUpstreams()));
    } catch (error) {
      this.upstreams.set(failed(error));
    }
  }

  protected openForm(): void {
    this.adding.set(true);
    this.writeError.set(null);
  }

  protected closeForm(): void {
    this.adding.set(false);
    this.domainInput.set('');
    this.slugInput.set('');
    this.writeError.set(null);
  }

  protected onDomainInput(event: Event): void {
    this.domainInput.set((event.target as HTMLInputElement).value);
  }

  protected onSlugInput(event: Event): void {
    this.slugInput.set((event.target as HTMLInputElement).value);
  }

  /** Register the pair, and splice the answer in rather than re-reading the list. */
  protected async add(): Promise<void> {
    if (!this.submittable()) {
      return;
    }
    const domain = cleanDomain(this.domainInput());
    const slug = cleanSlug(this.slugInput());
    this.busy.set('');
    this.writeError.set(null);
    try {
      const upstream = await this.api.registerMirrorUpstream(domain, slug);
      this.upstreams.set(ready(this.withUpstream(upstream)));
      this.closeForm();
    } catch (error) {
      this.writeError.set(this.explainWrite(error, 'register'));
    } finally {
      this.busy.set(null);
    }
  }

  /** Ask for the second press. The confirm text is where the bytes-stay sentence lives. */
  protected askRemove(domain: string): void {
    this.confirming.set(domain);
    this.writeError.set(null);
  }

  protected cancelRemove(): void {
    this.confirming.set(null);
  }

  /** Remove the upstream row. Nothing cached goes with it. */
  protected async remove(domain: string): Promise<void> {
    this.busy.set(domain);
    this.writeError.set(null);
    try {
      await this.api.removeMirrorUpstream(domain);
      this.upstreams.set(ready(this.rows().filter((row) => row.domain !== domain)));
      this.confirming.set(null);
    } catch (error) {
      this.writeError.set(this.explainWrite(error, 'remove'));
    } finally {
      this.busy.set(null);
    }
  }

  /** `localhost:8081/quay/` — what a pull through this row is addressed to. */
  protected prefix(upstream: MirrorUpstreamDto): string {
    return pullPrefix(this.registryHost, upstream.slug);
  }

  /** `1 image`, `0 images` — cached image *names*, never tags and never layers. */
  protected cached(upstream: MirrorUpstreamDto): string {
    return plural(upstream.cachedImages, 'image');
  }

  /** The list with this row in it, replacing any row for the same domain, ordered by namespace. */
  private withUpstream(upstream: MirrorUpstreamDto): readonly MirrorUpstreamDto[] {
    const kept = this.rows().filter((row) => row.domain !== upstream.domain);
    return [...kept, upstream].sort((left, right) => left.slug.localeCompare(right.slug));
  }

  /**
   * A failed write, in a sentence that names the caller who can succeed.
   *
   * The 401 is the one worth its own wording. Every other status is the service explaining itself
   * in its own words — a namespace that cannot move, a slug already taken by a repository of
   * another type — and those sentences are better than anything this page could paraphrase.
   */
  private explainWrite(error: unknown, verb: string): string {
    if (statusOf(error) === 401) {
      return (
        `This explorer cannot ${verb} an upstream: the write needs the platform's ` +
        'X-Artifacts-Token header, and no page in this application holds a credential of any kind. ' +
        'Run it from a shell that has the token.'
      );
    }
    return `Could not ${verb} the upstream — ${describeError(error)}.`;
  }
}
