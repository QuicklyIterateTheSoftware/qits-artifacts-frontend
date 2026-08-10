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
import type { GcRepositoryPlanReportDto, GcRepositorySweepReportDto } from '../api/dto';
import { Async } from '../ui/async';
import { formatBytes, formatInstant, plural } from '../ui/format';
import { LOADING, describeError, failed, ready, statusOf, type Loadable } from '../ui/loadable';
import { typeTone } from '../ui/repository-type';

/**
 * One repository's cleanup: what would be deleted, what would not, why each — and, below all of
 * it, the press that does it.
 *
 * **Load budget: `1 + 0`.** One read, `GET /artifacts/api/gc/repositories/<repo>/plan`, which
 * carries the whole report: both identity lists with their rules, both blob figures, the
 * configured rule, how the run read its live pins, and the row-less pool. Running costs one more
 * request and re-reads nothing, because the sweep answers with its receipt.
 *
 * **This page is the review gate, and the gate is its layout.** The standing rule on this platform
 * is that nothing sweeps without the dry run being read. The run button therefore lives only here,
 * below the rendered plan, and the repository list offers review rather than execution. What that
 * choreography guarantees is exact and worth being precise about: the report was **served and
 * displayed** before the invocation existed at all. It cannot prove anybody read it — no UI can —
 * and it does not claim to.
 *
 * **The plan on screen authorises; a fresh plan executes.** The service computes a new plan inside
 * the sweep request and applies that one, because a stored plan is a plan on stale facts and stale
 * facts delete a running image. So `generatedAt` is printed: it is how a reader sees that what they
 * are looking at is a photograph, and how old it is.
 *
 * **When the live pins cannot be read the run affordance is not rendered at all** — not disabled,
 * not greyed. A disabled button is a promise that pressing it later will work on what is on screen,
 * and what is on screen in that state is what the rules condemn rather than what a run would take.
 * The plan itself stays fully visible, because a review can happen perfectly well while qits-cd is
 * down.
 *
 * **The kept list is the half that makes the other half reviewable**, so it is on the page rather
 * than behind a link — collapsed, because it is usually the longer of the two, and every entry
 * names the rule that saved it.
 *
 * **After a run, the receipt replaces the plan in place.** A plan left on screen beside a receipt
 * is two answers to the same question, one of which is now false.
 */
@Component({
  selector: 'app-cleanup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, QitsBadge, QitsButton, RouterLink],
  templateUrl: './cleanup-page.html',
  styleUrls: ['../ui/page.css', './cleanup-page.css'],
})
export class CleanupPage {
  private readonly api = inject(ArtifactsApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatBytes = formatBytes;
  protected readonly formatInstant = formatInstant;
  protected readonly typeTone = typeTone;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: convertToParamMap({}),
  });

  protected readonly repoName = computed(() => this.params().get('repo') ?? '');

  protected readonly report = signal<Loadable<GcRepositoryPlanReportDto>>(LOADING);

  /** The receipt of a run that happened on this page, or null while the plan is what is shown. */
  protected readonly receipt = signal<GcRepositorySweepReportDto | null>(null);

  /** Whether the run is waiting for its second press. */
  protected readonly confirming = signal(false);

  /** Whether the sweep request is in flight. */
  protected readonly busy = signal(false);

  /** What the last run failed with, in this page's words. */
  protected readonly runError = signal<string | null>(null);

  /** The kept list is long and secondary — open it when the dead list raises a question. */
  protected readonly showKept = signal(false);

  protected readonly plan = computed<GcRepositoryPlanReportDto | null>(() => {
    const state = this.report();
    return state.kind === 'ready' ? state.value : null;
  });

  /** The repository exists but its type has no collector, or refused to plan. */
  protected readonly notCollected = computed(() => {
    const plan = this.plan();
    return plan !== null && plan.strategy === null;
  });

  /**
   * Whether the run affordance is drawn at all.
   *
   * Three things have to hold, and none of them is cosmetic: the run has to be executable (the
   * live pins answered), the type has to have planned (a refusal means these figures were never
   * computed), and there has to be something to delete.
   */
  protected readonly runnable = computed(() => {
    const plan = this.plan();
    return plan !== null && plan.executable && plan.error === null && plan.dead.length > 0;
  });

  /** `2 identities · 41.2 MiB` — what a run now would take, on the button and in the confirm. */
  protected readonly runLabel = computed(() => {
    const plan = this.plan();
    if (!plan) {
      return '';
    }
    return (
      `${plural(plan.dead.length, 'identity', 'identities')} · ` +
      formatBytes(plan.sweep.reclaimableBytes)
    );
  });

  /** What the grace window is holding back, as a sentence, or null when it is holding nothing. */
  protected readonly withheldNote = computed<string | null>(() => {
    const plan = this.plan();
    if (!plan || plan.sweep.withheldByGraceWindow === 0) {
      return null;
    }
    return (
      `${plural(plan.sweep.withheldByGraceWindow, 'blob')} (${formatBytes(plan.sweep.withheldBytes)})` +
      ` are younger than the ${plan.graceWindow} grace window and this run leaves them alone.` +
      ' Not lost — a later run takes them, with the rows that name them.'
    );
  });

  /** The difference between what the rule condemns and what a run now takes, or null when none. */
  protected readonly structuralNote = computed<string | null>(() => {
    const plan = this.plan();
    if (!plan || plan.structural.blobCount === plan.sweep.blobCount) {
      return null;
    }
    return (
      `The rule condemns ${plural(plan.structural.blobCount, 'blob')} ` +
      `(${formatBytes(plan.structural.reclaimableBytes)}) in total, whatever the age of the files.`
    );
  });

  constructor() {
    // The repository name is a path segment, so moving from one repository's cleanup to another
    // re-uses this component instance. Reading the parameter as a signal and reloading on it is
    // what makes that navigation actually load anything.
    effect(() => {
      const name = this.repoName();
      if (name) {
        void this.load();
      }
    });
  }

  /** Read the plan, and drop any receipt: what is on screen must be one answer, not two. */
  protected async load(): Promise<void> {
    this.receipt.set(null);
    this.confirming.set(false);
    this.runError.set(null);
    this.report.set(LOADING);
    try {
      this.report.set(ready(await this.api.gcRepositoryPlan(this.repoName())));
    } catch (error) {
      this.report.set(failed(error));
    }
  }

  /** Ask for the second press. Asking costs no request and deletes nothing. */
  protected askRun(): void {
    this.confirming.set(true);
    this.runError.set(null);
  }

  protected cancelRun(): void {
    this.confirming.set(false);
  }

  /** Run it. One request, and the receipt it answers with is what the page then shows. */
  protected async run(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.runError.set(null);
    try {
      const receipt = await this.api.gcRepositorySweep(this.repoName());
      this.receipt.set(receipt);
      this.confirming.set(false);
    } catch (error) {
      this.runError.set(this.explainRun(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** `2 identities`, `1 identity` — a count is never drawn without the noun it counts. */
  protected identities(count: number): string {
    return plural(count, 'identity', 'identities');
  }

  /** `@qits/thing@1.0.0 — superseded and unaccessed for longer than P30D` */
  protected identityLine(identity: { identity: string; rule: string }): string {
    return `${identity.identity} — ${identity.rule}`;
  }

  /** `qits-cd · 2 pins · 41 ms` — one pin source, as this run read it. */
  protected pinLine(pin: {
    source: string;
    answered: boolean;
    pinCount: number;
    tookMillis: number;
  }): string {
    const answered = pin.answered ? plural(pin.pinCount, 'pin') : 'did not answer';
    return `${pin.source} · ${answered} · ${pin.tookMillis} ms`;
  }

  /**
   * A failed run, in a sentence that names the caller who can succeed.
   *
   * The 401 is the one worth its own wording: the guard is the service's and no page in this
   * application holds a credential of any kind. Everything else is
   * the service explaining itself in its own words, which beats anything this page could
   * paraphrase.
   */
  private explainRun(error: unknown): string {
    if (statusOf(error) === 401) {
      return (
        'This explorer cannot run a cleanup: the write needs the platform’s X-Artifacts-Token ' +
        'header, and no page in this application holds a credential of any kind. Run it from a ' +
        'shell that has the token. Nothing was deleted.'
      );
    }
    return `The cleanup did not run — ${describeError(error)}. Nothing was deleted.`;
  }
}
