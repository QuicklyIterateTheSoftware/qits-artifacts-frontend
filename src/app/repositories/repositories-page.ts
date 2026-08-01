import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QitsBadge, QitsButton } from '@qits/ui-components';
import { ArtifactsApi } from '../api/artifacts-api';
import type { ArtifactRepositoryDto, StoreSummaryDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { formatBytes, itemNoun, plural } from '../ui/format';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { typeTone } from '../ui/repository-type';
import { StoreSummary } from './store-summary';

/**
 * The front door: every repository in the store, what type it is, how much it holds, and what it
 * costs — beside a panel that says plainly which of the three possible byte counts each figure is.
 *
 * **Load budget: `2 + 0`.** Two flat reads, and nothing per row:
 *
 * - `GET /artifacts/api/repositories` — the five repositories, each with its type, its item count
 *   and its own union.
 * - `GET /artifacts/api/store/summary` — the seven store-level figures.
 *
 * The variable term is genuinely zero and stays zero: a row's count and size arrive with the row,
 * so nothing here fans out per repository. Drilling in is a navigation, not an expansion, which is
 * what keeps this page's cost flat however many repositories the store grows.
 *
 * The two reads are independent and both are issued at once. A failed summary leaves the table
 * standing with its own retry, and a failed table leaves the summary standing — they answer
 * different questions and neither is a precondition for the other.
 *
 * **The item counts are not comparable, and the column says so.** `itemCount` is images for an OCI
 * repository, packages for an npm one and records for the two ci types; a column headed "items"
 * with 10, 710, 2, 0, 0 in it would invite a comparison between three different nouns. Each cell
 * carries its noun.
 *
 * **The git host is a footer note, not a row.** It shares this service's process and the
 * `/artifacts/` URL segment and nothing else — separate volume, no blob store, no rows, no
 * `artifact_repository` entry. Listing it as a sixth repository would put a thing with no type, no
 * count and no size into a table about types, counts and sizes; the honest thing is to say it
 * exists, say where it lives, and leave it out of the arithmetic.
 */
@Component({
  selector: 'app-repositories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsBadge, QitsButton, RouterLink, StoreSummary],
  templateUrl: './repositories-page.html',
  styleUrls: ['../ui/page.css', './repositories-page.css'],
})
export class RepositoriesPage {
  private readonly api = inject(ArtifactsApi);

  protected readonly formatBytes = formatBytes;
  protected readonly typeTone = typeTone;

  protected readonly repositories = signal<Loadable<readonly ArtifactRepositoryDto[]>>(LOADING);
  protected readonly summary = signal<Loadable<StoreSummaryDto>>(LOADING);

  /** The rows, once they are here; an empty list otherwise, so the template stays flat. */
  protected readonly rows = computed(() => {
    const state = this.repositories();
    return state.kind === 'ready' ? state.value : [];
  });

  /** `5 repositories` — the store's shape in one clause, above the table. */
  protected readonly lede = computed(() => {
    const state = this.repositories();
    return state.kind === 'ready' ? plural(state.value.length, 'repository', 'repositories') : '';
  });

  constructor() {
    void this.reload();
  }

  /** The one button on this page: read both roots again. */
  protected async reload(): Promise<void> {
    await Promise.all([this.loadRepositories(), this.loadSummary()]);
  }

  protected async loadRepositories(): Promise<void> {
    this.repositories.set(LOADING);
    try {
      this.repositories.set(ready(await this.api.repositories()));
    } catch (error) {
      this.repositories.set(failed(error));
    }
  }

  protected async loadSummary(): Promise<void> {
    this.summary.set(LOADING);
    try {
      this.summary.set(ready(await this.api.storeSummary()));
    } catch (error) {
      this.summary.set(failed(error));
    }
  }

  /** `10 images`, `710 packages`, `0 records` — the count with the noun its type actually counts. */
  protected contents(repository: ArtifactRepositoryDto): string {
    return plural(repository.itemCount, itemNoun(repository.type));
  }
}
