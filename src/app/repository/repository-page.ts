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
import { QitsBadge, QitsButton } from '@qits/ui-components';
import { ArtifactsApi } from '../api/artifacts-api';
import type { ArtifactRepositoryDto, NpmPackageDto, OciImageDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { NONE, formatBytes, itemNoun, plural } from '../ui/format';
import { IDLE, LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { isNpm, isOci, typeSummary, typeTone } from '../ui/repository-type';

/**
 * One repository, drawn as whatever its type actually holds.
 *
 * **Load budget: `1 + 1`.** One read to learn what this repository *is*, and one listing whose
 * endpoint that answer chooses:
 *
 * - `GET /artifacts/api/repositories` — the only way to learn a repository's type; there is no
 *   endpoint that describes one on its own.
 * - then exactly one of `…/images` or `…/packages`, or **none at all** for the two ci types, which
 *   have no listing endpoint because they have never held a row.
 *
 * So the variable term is 0 or 1 and never more, and a `ci-screenshots` page costs one request in
 * total. The listing's rows carry their own counts and sizes, so nothing fans out per row here
 * either.
 *
 * The type read is repeated on every page of this app rather than cached in a service. That is a
 * deliberate trade: a cache would need an invalidation story for a store this UI cannot write to
 * anyway, and the read is one flat list of five rows. Reloading a page is how you refresh it.
 *
 * **The ci types are drawn, not hidden.** A repository that exists and holds nothing is a fact
 * about this platform — the golden-diff loop these two were built for has never produced a single
 * record — and a UI that skipped them would be quietly claiming the store has three repositories.
 * The empty state says which of the two it is.
 *
 * **Cached and published npm are separate pages because they are separate repositories**, and this
 * page never mixes them. Proxied npm outweighs published npm 1,971:1 by bytes and 176:1 by version
 * count on this deployment; a single listing with a filter would bury the platform's own two
 * packages at 0.6% of the rows, and the store already models the distinction structurally.
 */
@Component({
  selector: 'app-repository-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsBadge, QitsButton, RouterLink],
  templateUrl: './repository-page.html',
  styleUrls: ['../ui/page.css', './repository-page.css'],
})
export class RepositoryPage {
  private readonly api = inject(ArtifactsApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatBytes = formatBytes;
  protected readonly typeTone = typeTone;
  protected readonly typeSummary = typeSummary;
  protected readonly none = NONE;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: convertToParamMap({}),
  });

  protected readonly repoName = computed(() => this.params().get('repo') ?? '');

  /** The whole repository list, because the type is only knowable from it. */
  protected readonly repositories = signal<Loadable<readonly ArtifactRepositoryDto[]>>(LOADING);

  /** Idle until the type says this repository has images — which for four of five it does not. */
  protected readonly images = signal<Loadable<readonly OciImageDto[]>>(IDLE);

  /** Idle until the type says this repository has packages. */
  protected readonly packages = signal<Loadable<readonly NpmPackageDto[]>>(IDLE);

  /** This repository's own row, once the list is here. */
  protected readonly repository = computed<ArtifactRepositoryDto | null>(() => {
    const state = this.repositories();
    if (state.kind !== 'ready') {
      return null;
    }
    return state.value.find((row) => row.name === this.repoName()) ?? null;
  });

  /** The list answered and this name was not in it — a sentence, not a crash. */
  protected readonly missing = computed(
    () => this.repositories().kind === 'ready' && this.repository() === null,
  );

  protected readonly isOci = computed(() => isOci(this.repository()?.type ?? ''));
  protected readonly isNpm = computed(() => isNpm(this.repository()?.type ?? ''));

  /** True for the two types that have no listing endpoint at all. */
  protected readonly hasNoListing = computed(
    () => this.repository() !== null && !this.isOci() && !this.isNpm(),
  );

  protected readonly imageRows = computed(() => {
    const state = this.images();
    return state.kind === 'ready' ? state.value : [];
  });

  protected readonly packageRows = computed(() => {
    const state = this.packages();
    return state.kind === 'ready' ? state.value : [];
  });

  /** `10 images · 4.04 GiB (union)` — the repository's shape under its heading. */
  protected readonly lede = computed(() => {
    const repository = this.repository();
    if (!repository) {
      return '';
    }
    const contents = plural(repository.itemCount, itemNoun(repository.type));
    return `${contents} · ${formatBytes(repository.sizeBytes)} (union over this repository's blobs)`;
  });

  constructor() {
    // The repository name is a path segment, so navigating from one repository to its neighbour
    // re-uses this component instance rather than building a new one. Reading the parameter as a
    // signal and reloading on it is what makes that navigation actually load anything.
    effect(() => {
      const name = this.repoName();
      if (name) {
        void this.reload();
      }
    });
  }

  protected async reload(): Promise<void> {
    this.images.set(IDLE);
    this.packages.set(IDLE);
    this.repositories.set(LOADING);
    try {
      const repositories = await this.api.repositories();
      this.repositories.set(ready(repositories));
      const repository = repositories.find((row) => row.name === this.repoName());
      if (repository && isOci(repository.type)) {
        await this.loadImages();
      } else if (repository && isNpm(repository.type)) {
        await this.loadPackages();
      }
    } catch (error) {
      this.repositories.set(failed(error));
    }
  }

  protected async loadImages(): Promise<void> {
    this.images.set(LOADING);
    try {
      this.images.set(ready(await this.api.images(this.repoName())));
    } catch (error) {
      this.images.set(failed(error));
    }
  }

  protected async loadPackages(): Promise<void> {
    this.packages.set(LOADING);
    try {
      this.packages.set(ready(await this.api.packages(this.repoName())));
    } catch (error) {
      this.packages.set(failed(error));
    }
  }

  /** `22 tags · 22 manifests` — what an image row carries beside its size. */
  protected imageMeta(image: OciImageDto): string {
    return `${plural(image.tagCount, 'tag')} · ${plural(image.manifestCount, 'manifest')}`;
  }

  /** The sentence for a type that has a shape and no content. */
  protected readonly emptyTypeMessage = computed(() => {
    const type = this.repository()?.type;
    const what = type === 'ci-videos' ? 'video' : 'screenshot';
    return (
      `A shape with no content: this repository holds no ${what} records at all. ` +
      'It was built for the CI golden-diff loop, and that loop has never produced anything.'
    );
  });
}
