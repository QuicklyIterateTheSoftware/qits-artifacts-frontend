import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, convertToParamMap } from '@angular/router';
import { QitsBadge, QitsButton } from '@qits/ui-components';
import { ArtifactsApi } from '../api/artifacts-api';
import type {
  ArtifactFilters,
  ArtifactRecordDto,
  ArtifactRepositoryDto,
  DaemonDto,
  DocsSiteDto,
  NpmPackageDto,
  MavenPackageDto,
  OciImageDto,
} from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { NONE, formatBytes, formatInstant, itemNoun, plural, shortDigest } from '../ui/format';
import { IDLE, LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { isNpm, isOci, typeSummary, typeTone } from '../ui/repository-type';
import { ArtifactsLinks } from '../ui/links';

/**
 * One repository, drawn as whatever its type actually holds.
 *
 * **Load budget: `1 + 1`.** One read to learn what this repository *is*, and one listing whose
 * endpoint that answer chooses:
 *
 * - `GET /artifacts/api/repositories` — the only way to learn a repository's type; there is no
 *   endpoint that describes one on its own.
 * - then exactly one of `…/images`, `…/packages`, `…/maven-packages`, `…/daemons`, `…/docs` or
 *   `…/blobs` — one listing per type, chosen by that answer, and **none at all** for a type this
 *   explorer has no listing for yet.
 *
 * So the variable term is 0 or 1 and never more, and a page for a type with no listing costs one
 * request in total. The listing's rows carry their own counts and sizes, so nothing fans out per
 * row here either.
 *
 * The type read is repeated on every page of this app rather than cached in a service. That is a
 * deliberate trade: a cache would need an invalidation story for a store this UI cannot write to
 * anyway, and the read is one flat list of a handful of rows. Reloading a page is how you refresh
 * it.
 *
 * **The ci types are drawn, not hidden.** A repository that exists and holds nothing is a fact
 * about this platform — the golden-diff loop these two were built for has never produced a single
 * record — and a UI that skipped them would be quietly claiming the store is smaller than it is.
 * They get the record table, which draws its own empty state.
 *
 * **The fallback below them says nothing about content.** It used to be a sentence about that
 * golden-diff loop, and every type this file had not learned yet — `daemon-binaries` first, then
 * `docs` — inherited it: a repository full of published bundles told the reader it was an empty CI
 * shape. A fallback is reached precisely when this page does not know what a type holds, so the
 * only honest thing it can say is that it does not know.
 */
@Component({
  selector: 'app-repository-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, FormsModule, QitsBadge, QitsButton, RouterLink],
  templateUrl: './repository-page.html',
  styleUrls: ['../ui/page.css', './repository-page.css'],
})
export class RepositoryPage {
  protected readonly links = inject(ArtifactsLinks);

  private readonly api = inject(ArtifactsApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatBytes = formatBytes;
  protected readonly formatInstant = formatInstant;
  protected readonly shortDigest = shortDigest;
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
  protected readonly mavenPackages = signal<Loadable<readonly MavenPackageDto[]>>(IDLE);

  /** Idle until the type says this repository has daemons. */
  protected readonly daemons = signal<Loadable<readonly DaemonDto[]>>(IDLE);

  /** Idle until the type says this repository has documentation sites. */
  protected readonly docsSites = signal<Loadable<readonly DocsSiteDto[]>>(IDLE);

  protected readonly search = signal('');

  /** Directly uploaded CI records; idle for protocol repositories. */
  protected readonly records = signal<Loadable<readonly ArtifactRecordDto[]>>(IDLE);

  protected createdAfter = '';
  protected createdBefore = '';
  protected accessedAfter = '';
  protected accessedBefore = '';
  protected minSize: number | null = null;
  protected maxSize: number | null = null;
  protected accessState = '';

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
  protected readonly isMaven = computed(() => this.repository()?.type === 'maven-packages');
  protected readonly isDaemons = computed(() => this.repository()?.type === 'daemon-binaries');
  protected readonly isDocs = computed(() => this.repository()?.type === 'docs');
  protected readonly isCi = computed(() => {
    const type = this.repository()?.type;
    return type === 'ci-screenshots' || type === 'ci-videos';
  });

  /** True for a type this explorer has no listing for — none, today, and the fallback says so
   * without guessing at what such a repository would hold. */
  protected readonly hasNoListing = computed(
    () =>
      this.repository() !== null &&
      !this.isOci() &&
      !this.isNpm() &&
      !this.isMaven() &&
      !this.isDaemons() &&
      !this.isDocs() &&
      !this.isCi(),
  );

  protected readonly imageRows = computed(() => {
    const state = this.images();
    return state.kind === 'ready' ? this.filtered(state.value) : [];
  });

  protected readonly packageRows = computed(() => {
    const state = this.packages();
    return state.kind === 'ready' ? this.filtered(state.value) : [];
  });
  protected readonly mavenRows = computed(() => {
    const state = this.mavenPackages();
    return state.kind === 'ready' ? this.filtered(state.value) : [];
  });
  protected readonly daemonRows = computed(() => {
    const state = this.daemons();
    return state.kind === 'ready' ? this.filtered(state.value) : [];
  });
  protected readonly docsRows = computed(() => {
    const state = this.docsSites();
    return state.kind === 'ready' ? this.filtered(state.value) : [];
  });

  protected readonly recordRows = computed(() => {
    const state = this.records();
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
    this.mavenPackages.set(IDLE);
    this.daemons.set(IDLE);
    this.docsSites.set(IDLE);
    this.records.set(IDLE);
    this.repositories.set(LOADING);
    try {
      const repositories = await this.api.repositories();
      this.repositories.set(ready(repositories));
      const repository = repositories.find((row) => row.name === this.repoName());
      if (repository && isOci(repository.type)) {
        await this.loadImages();
      } else if (repository && isNpm(repository.type)) {
        await this.loadPackages();
      } else if (repository?.type === 'maven-packages') {
        await this.loadMavenPackages();
      } else if (repository?.type === 'daemon-binaries') {
        await this.loadDaemons();
      } else if (repository?.type === 'docs') {
        await this.loadDocsSites();
      } else if (
        repository &&
        (repository.type === 'ci-screenshots' || repository.type === 'ci-videos')
      ) {
        await this.loadRecords();
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

  protected async loadMavenPackages(): Promise<void> {
    this.mavenPackages.set(LOADING);
    try { this.mavenPackages.set(ready(await this.api.mavenPackages(this.repoName()))); }
    catch (error) { this.mavenPackages.set(failed(error)); }
  }

  protected async loadDaemons(): Promise<void> {
    this.daemons.set(LOADING);
    try {
      this.daemons.set(ready(await this.api.daemons(this.repoName())));
    } catch (error) {
      this.daemons.set(failed(error));
    }
  }

  protected async loadDocsSites(): Promise<void> {
    this.docsSites.set(LOADING);
    try {
      this.docsSites.set(ready(await this.api.docsSites(this.repoName())));
    } catch (error) {
      this.docsSites.set(failed(error));
    }
  }

  protected setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  private filtered<T extends { readonly name: string }>(rows: readonly T[]): readonly T[] {
    const needle = this.search().trim().toLocaleLowerCase();
    return needle ? rows.filter((row) => row.name.toLocaleLowerCase().includes(needle)) : rows;
  }

  protected async loadRecords(): Promise<void> {
    this.records.set(LOADING);
    try {
      this.records.set(ready(await this.api.artifactRecords(this.repoName(), this.filters())));
    } catch (error) {
      this.records.set(failed(error));
    }
  }

  protected clearFilters(): void {
    this.createdAfter = '';
    this.createdBefore = '';
    this.accessedAfter = '';
    this.accessedBefore = '';
    this.minSize = null;
    this.maxSize = null;
    this.accessState = '';
    void this.loadRecords();
  }

  private filters(): ArtifactFilters {
    return {
      createdAfter: utcInstant(this.createdAfter),
      createdBefore: utcInstant(this.createdBefore),
      accessedAfter: utcInstant(this.accessedAfter),
      accessedBefore: utcInstant(this.accessedBefore),
      minSize: this.minSize ?? undefined,
      maxSize: this.maxSize ?? undefined,
      neverAccessed:
        this.accessState === 'never' ? true : this.accessState === 'accessed' ? false : undefined,
    };
  }

  protected metadata(record: ArtifactRecordDto): string {
    const entries = Object.entries(record.metadata);
    return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(' · ') : NONE;
  }

  /** `22 tags · 22 manifests` — what an image row carries beside its size. */
  protected imageMeta(image: OciImageDto): string {
    return `${plural(image.tagCount, 'tag')} · ${plural(image.manifestCount, 'manifest')}`;
  }
}

/** The controls are explicitly UTC, so a browser's locale never changes the query instant. */
function utcInstant(value: string): string | undefined {
  return value ? `${value}:00Z` : undefined;
}
