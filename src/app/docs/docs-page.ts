import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, convertToParamMap } from '@angular/router';
import { QitsButton } from '@qits/ui-components';
import { ArtifactsApi } from '../api/artifacts-api';
import type { DocsVersionDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { NONE, formatBytes, formatInstant, plural, shortSha } from '../ui/format';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { ArtifactsLinks } from '../ui/links';

/**
 * One documentation site: its published versions, and a way into each of them.
 *
 * **Load budget: `1 + 0`.**
 *
 * - `GET …/repositories/{repo}/docs/{site}/versions` — the table, metadata and all.
 *
 * Nothing per row. The metadata a version was published with rides on the same answer, so the
 * branch and commit columns cost no second read — which is the reason they are columns rather than
 * a disclosure.
 *
 * **The "Open" link is the point of this page.** A docs version is a bundle published whole at
 * `/artifacts/docs/<repo>/<site>/-/<version>/index.html`, and that URL is the only thing anybody
 * came here for; every other column is context for choosing which one to press. It is a real
 * `<a [href]>` because it leaves this application entirely — a `routerLink` would compile and land
 * on the 404 page.
 *
 * **The site segment carries slashes, and the two spellings are not the same.** `@userflows/qits-
 * artifacts` is one site name with a separator inside it. Angular's serialiser encodes it to `%2F`
 * on the way into this route and decodes it back out, so what {@link DocsPage.site} holds is the
 * literal name — the same round trip `:package` and `:coordinate` make. The **API** re-encodes it,
 * because the browse endpoint takes either; the **wire** takes only the literal form, so the open
 * link below spells the slashes out rather than encoding them. Encoding that one would 404.
 *
 * **A version is immutable, so an opened bundle never changes meaning.** That is what makes a link
 * to `index.html` a safe thing to hand out: the row a reader pressed yesterday serves the same
 * bytes today, or it has been evicted whole and is a 404. It is never quietly different.
 *
 * **`fileCount` and `sizeBytes` are answers to different questions and do not derive from each
 * other.** The first counts the paths this version serves; the second is the union over the
 * distinct blobs behind them, so a bundle shipping identical bytes at two paths has two files and
 * one blob's worth of disk. Neither column is totalled: versions of a site share blobs heavily, and
 * the per-site union on the repository listing is smaller than this column's sum by design.
 */
@Component({
  selector: 'app-docs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsButton, RouterLink],
  templateUrl: './docs-page.html',
  styleUrls: ['../ui/page.css', './docs-page.css'],
})
export class DocsPage {
  protected readonly links = inject(ArtifactsLinks);

  private readonly api = inject(ArtifactsApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatBytes = formatBytes;
  protected readonly formatInstant = formatInstant;
  protected readonly none = NONE;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: convertToParamMap({}),
  });

  protected readonly repoName = computed(() => this.params().get('repo') ?? '');

  /**
   * The site name, separator included. Angular decoded the `%2F` on the way in, so what arrives
   * here is `@userflows/qits-artifacts` — the literal name the wire wants back.
   */
  protected readonly site = computed(() => this.params().get('site') ?? '');

  protected readonly versions = signal<Loadable<readonly DocsVersionDto[]>>(LOADING);

  protected readonly rows = computed(() => {
    const state = this.versions();
    return state.kind === 'ready' ? state.value : [];
  });

  protected readonly lede = computed(() => {
    const state = this.versions();
    return state.kind === 'ready' ? `${plural(state.value.length, 'version')} · newest first` : '';
  });

  constructor() {
    effect(() => {
      const repository = this.repoName();
      const site = this.site();
      if (repository && site) {
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    this.versions.set(LOADING);
    try {
      this.versions.set(ready(await this.api.docsVersions(this.repoName(), this.site())));
    } catch (error) {
      this.versions.set(failed(error));
    }
  }

  /**
   * The bundle's entry point on the docs wire.
   *
   * The site's slashes are left literal on purpose: the wire's route grammar matches a name across
   * segments and has no percent-encoded spelling, so `%2F` here would be a 404. Every *other*
   * segment is encoded, because a version string is not a path.
   */
  protected openHref(version: DocsVersionDto): string {
    const site = this.site()
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return (
      `/artifacts/docs/${encodeURIComponent(this.repoName())}/${site}` +
      `/-/${encodeURIComponent(version.version)}/index.html`
    );
  }

  /** The branch this bundle was built from, as the publisher declared it. */
  protected branch(version: DocsVersionDto): string {
    return version.metadata['git.branch.name'] || NONE;
  }

  /**
   * The commit, abbreviated the way git abbreviates. It is a **declaration by the publisher**, not
   * something this store verified — the metadata map is whatever rode on the upload's headers — so
   * it is printed for a reader to match and is deliberately not a link anywhere.
   */
  protected commit(version: DocsVersionDto): string {
    const hash = version.metadata['git.commit.hash'];
    return hash ? shortSha(hash) : NONE;
  }

  /** What a reader is about to open, spelled out for a screen reader. */
  protected openLabel(version: DocsVersionDto): string {
    return `Open ${this.site()} version ${version.version}`;
  }
}
