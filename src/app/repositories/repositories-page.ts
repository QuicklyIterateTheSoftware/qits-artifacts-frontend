import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QitsBadge, QitsButton } from '@qits/ui-components';
import { ArtifactsApi } from '../api/artifacts-api';
import type {
  ArtifactRepositoryDto,
  GcRepositoriesPlanResponse,
  GcRepositoryPlanSummaryDto,
  StoreSummaryDto,
} from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { NONE, formatBytes, itemNoun, plural } from '../ui/format';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { isMirror, typeTone } from '../ui/repository-type';
import { StoreSummary } from './store-summary';

/** What the Cleanup column draws for one row, decided once here rather than in the template. */
export type CleanupCell =
  /** The cleanup read has not arrived, or failed. An em dash — never a zero. */
  | { readonly kind: 'unknown' }
  /** This repository's type refused to plan. Its zeros are a refusal, not a finding. */
  | { readonly kind: 'refused'; readonly title: string }
  /** Nobody collects this type. A decision, and a different fact from "already clean". */
  | { readonly kind: 'not-collected'; readonly title: string }
  /** A rule ran and found nothing to delete. */
  | { readonly kind: 'nothing' }
  /** A rule ran and found something. */
  | {
      readonly kind: 'figure';
      readonly text: string;
      readonly title: string;
      /** False while the live pins cannot be read: computable, but not runnable right now. */
      readonly runnable: boolean;
    };

/**
 * The front door: every repository in the store, what type it is, how much it holds, what it costs
 * — and what cleaning it up would free — beside a panel that says plainly which of the three
 * possible byte counts each figure is.
 *
 * **Load budget: `3 + 0`.** Three flat reads, and nothing per row:
 *
 * - `GET /artifacts/api/repositories` — the repositories, each with its type, item count and union.
 * - `GET /artifacts/api/store/summary` — the store-level figures.
 * - `GET /artifacts/api/gc/repositories` — every repository's expected cleanup, from one run.
 *
 * The variable term is genuinely zero and stays zero. The third read is the one that had to be
 * designed for it: a cleanup plan costs the service a full census plus two cross-service calls to
 * qits-cd and qits-ci, so a per-row endpoint would have made this page N censuses and 2N of those
 * calls deep, and would have read the live pins N times in a run that is meant to read them once.
 * The service answers every row from a single run instead.
 *
 * The three reads are independent and all are issued at once. Any one of them failing leaves the
 * other two standing with their own retry — they answer different questions and none is a
 * precondition for another.
 *
 * **The item counts are not comparable, and the column says so.** `itemCount` is images for an OCI
 * repository, packages for an npm one, deployed files for maven, published versions for the
 * daemons and records for the two ci types; a column headed "items" with 10, 710, 2, 0, 0 in it
 * would invite a comparison between five different nouns. Each cell carries its noun.
 *
 * **The Cleanup column must never be summed, and it is not the same kind of number as the one
 * beside it.** A repository's cleanup figure is what cleaning *that repository alone* would free —
 * the store-wide reconciliation with only its dead identities applied and every other repository
 * left standing. So a blob two repositories both let go of counts in neither figure and dies only
 * in a whole-store run: the column is a lower bound, never a total, and the caption says so.
 *
 * **A zero in that column is four different facts, and the cell distinguishes them** ({@link
 * CleanupCell}): the read has not arrived, the type refused to plan because the live pins could not
 * be read, nobody collects this type at all, or a rule ran and found nothing. Drawing all four as
 * `0` would claim the store is clean when three of them claim nothing of the sort.
 *
 * **No run button lives on this page.** The row offers review; the running is behind the plan, on
 * the repository's own cleanup page, where the report the press executes against is on screen. The
 * standing rule is that nothing sweeps without the dry-run being read, and a button beside a figure
 * in a table would be the exact shape that rule exists to refuse.
 *
 * **The mirror namespaces are rows, and they are also a footnote.** They are ordinary repositories
 * with a type, a count and a size, so they belong in the table on the same terms as everything
 * else. What the table cannot say is which upstream each one fronts — that is keyed by domain, not
 * by repository name — so a footnote points at the page that can, and it is drawn only when there
 * is at least one such row to point at.
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
  protected readonly none = NONE;

  protected readonly repositories = signal<Loadable<readonly ArtifactRepositoryDto[]>>(LOADING);
  protected readonly summary = signal<Loadable<StoreSummaryDto>>(LOADING);
  protected readonly cleanup = signal<Loadable<GcRepositoriesPlanResponse>>(LOADING);

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

  /** The cleanup plan, once it is here. */
  private readonly plan = computed<GcRepositoriesPlanResponse | null>(() => {
    const state = this.cleanup();
    return state.kind === 'ready' ? state.value : null;
  });

  /**
   * Why no cleanup can be run at all right now, or null.
   *
   * Run-wide rather than per row on purpose: the service reads its live pins once per run and a
   * source that cannot answer aborts the whole run, so no repository is runnable while another is
   * not. Said once, above the table, instead of eight times inside it.
   */
  protected readonly pinsDown = computed<string | null>(() => {
    const plan = this.plan();
    if (!plan || plan.executable) {
      return null;
    }
    return plan.pinFailures.join('; ');
  });

  /** How many of the rows are mirror namespaces. Zero hides the footnote about them entirely. */
  protected readonly mirrorCount = computed(
    () => this.rows().filter((repository) => isMirror(repository.type)).length,
  );

  /** `Three of these are mirror namespaces.` — the footnote's opening clause. */
  protected readonly mirrorNote = computed(() => {
    const count = this.mirrorCount();
    return count === 1
      ? 'One of these is a mirror namespace.'
      : `${count} of these are mirror namespaces.`;
  });

  constructor() {
    void this.reload();
  }

  /** The one button on this page: read all three roots again. */
  protected async reload(): Promise<void> {
    await Promise.all([this.loadRepositories(), this.loadSummary(), this.loadCleanup()]);
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

  protected async loadCleanup(): Promise<void> {
    this.cleanup.set(LOADING);
    try {
      this.cleanup.set(ready(await this.api.gcRepositories()));
    } catch (error) {
      this.cleanup.set(failed(error));
    }
  }

  /** `10 images`, `710 packages`, `0 records` — the count with the noun its type actually counts. */
  protected contents(repository: ArtifactRepositoryDto): string {
    return plural(repository.itemCount, itemNoun(repository.type));
  }

  /**
   * What this repository's Cleanup cell says — the four kinds of zero told apart.
   *
   * The order of the tests is the order of the facts: a refusal outranks everything below it
   * because its figures were never computed; a type nobody collects outranks "nothing" because a
   * rule that never ran found nothing in a different sense than a rule that ran.
   */
  protected cleanupCell(repository: ArtifactRepositoryDto): CleanupCell {
    const summary = this.summaryFor(repository.name);
    if (!summary) {
      return { kind: 'unknown' };
    }
    if (summary.error) {
      return { kind: 'refused', title: summary.error };
    }
    if (!summary.strategy) {
      return {
        kind: 'not-collected',
        title: summary.note ?? 'No collector is configured for this repository type.',
      };
    }
    if (summary.identitiesCondemned === 0 && summary.blobsSweepable === 0) {
      return { kind: 'nothing' };
    }
    return {
      kind: 'figure',
      text:
        `${plural(summary.identitiesCondemned, 'identity', 'identities')} · ` +
        formatBytes(summary.reclaimableBytes),
      title: this.figureTitle(summary),
      runnable: this.plan()?.executable ?? false,
    };
  }

  private summaryFor(name: string): GcRepositoryPlanSummaryDto | null {
    return this.plan()?.repositories.find((row) => row.repository === name) ?? null;
  }

  /**
   * The sentence behind a figure: which bytes it is, and what the grace window is holding back.
   *
   * The withheld part belongs here rather than in the cell because it is the difference between
   * "what the rule condemns" and "what a run tonight takes", and a table cell that tried to carry
   * both numbers would carry neither legibly.
   */
  private figureTitle(summary: GcRepositoryPlanSummaryDto): string {
    const held =
      summary.withheldByGraceWindow > 0
        ? ` ${plural(summary.withheldByGraceWindow, 'blob')} (${formatBytes(summary.withheldBytes)})` +
          ` of that is younger than the grace window and a run now would leave it — not lost, not yet.`
        : '';
    return (
      `What cleaning ${summary.repository} alone would free: bytes nothing else in the store names.` +
      ` Not additive with the other rows.${held}`
    );
  }
}
