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
import type { NpmVersionDto, RepositoryTypeSlug } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { NONE, formatBytes, formatInstant, plural } from '../ui/format';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';

/**
 * One npm package: its versions, what each weighs, and — for a package published here rather than
 * cached from upstream — which dist-tags point at it.
 *
 * **Load budget: `2 + 0`.**
 *
 * - `GET /artifacts/api/repositories` — to learn whether this is the hosted registry or the proxy,
 *   which decides what the page may claim about the rows below.
 * - `GET …/repositories/{repo}/packages/{package}/versions` — the table.
 *
 * Nothing per row.
 *
 * **The type read is not decoration.** A proxy caches versions, not the upstream's tag pointers, so
 * a dist-tag column drawn against cached rows would be a column of things this store does not know.
 * The page reads which kind of repository it is in and drops the column rather than filling it with
 * blanks that look like "no tags point here".
 *
 * **A null size is not a zero.** A proxied version can be indexed from a packument without its
 * tarball ever having been pulled; that row is real, its size is genuinely unknown, and the table
 * prints "not measured" rather than a plausible number. The same holds for a missing publish date.
 * The footer totals nothing — these tarballs are separate blobs and do not overlap the way OCI
 * layers do, but a total under a column with unmeasured rows in it would still be an
 * under-statement presented as a sum.
 */
@Component({
  selector: 'app-package-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsButton, RouterLink],
  templateUrl: './package-page.html',
  styleUrls: ['../ui/page.css', './package-page.css'],
})
export class PackagePage {
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
   * The package name, scope included. Angular decoded the `%2F` on the way in, so what arrives
   * here is `@qits/ui-components` — the name the service wants back, re-encoded by the API client.
   */
  protected readonly packageName = computed(() => this.params().get('package') ?? '');

  protected readonly versions = signal<Loadable<readonly NpmVersionDto[]>>(LOADING);

  /**
   * Which kind of npm repository this is. Null while unknown, and null is drawn as *neither* claim
   * — the dist-tag column stays hidden rather than appearing on a guess.
   */
  protected readonly type = signal<RepositoryTypeSlug | null>(null);

  protected readonly rows = computed(() => {
    const state = this.versions();
    return state.kind === 'ready' ? state.value : [];
  });

  protected readonly hosted = computed(() => this.type() === 'npm-packages');
  protected readonly cached = computed(() => this.type() === 'npm-proxy');

  /** How many columns the empty row has to span — the dist-tag column comes and goes. */
  protected readonly columns = computed(() => (this.hosted() ? 4 : 3));

  protected readonly lede = computed(() => {
    const state = this.versions();
    if (state.kind !== 'ready') {
      return '';
    }
    const where = this.cached()
      ? 'cached from the upstream registry'
      : this.hosted()
        ? 'published to this platform'
        : '';
    return where
      ? `${plural(state.value.length, 'version')} · ${where}`
      : plural(state.value.length, 'version');
  });

  constructor() {
    effect(() => {
      const repository = this.repoName();
      const packageName = this.packageName();
      if (repository && packageName) {
        void this.reload();
      }
    });
  }

  protected async reload(): Promise<void> {
    await Promise.all([this.loadType(), this.loadVersions()]);
  }

  private async loadType(): Promise<void> {
    try {
      const repositories = await this.api.repositories();
      this.type.set(repositories.find((row) => row.name === this.repoName())?.type ?? null);
    } catch {
      // Framing, not content. Without it the page says less; it does not say anything wrong.
      this.type.set(null);
    }
  }

  protected async loadVersions(): Promise<void> {
    this.versions.set(LOADING);
    try {
      this.versions.set(ready(await this.api.versions(this.repoName(), this.packageName())));
    } catch (error) {
      this.versions.set(failed(error));
    }
  }

  /** `latest, next` — or an em dash where no tag points at this version. */
  protected distTags(version: NpmVersionDto): string {
    return version.distTags.length > 0 ? version.distTags.join(', ') : NONE;
  }
}
