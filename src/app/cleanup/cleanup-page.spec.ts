import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_NAVIGATION, QITS_PRIVATE_APP_HINT, toNavTree } from '@qits/ui-components';
import { routes } from '../app.routes';
import type { GcRepositoryPlanReportDto, GcRepositorySweepReportDto } from '../api/dto';

/** qits-orchestrator's own origin, as the navigation names it: every call on this page goes there. */
const ORCHESTRATOR = 'https://orchestrator.qits.example/orchestrator/api/artifacts/repositories';

/**
 * The review gate, one state at a time.
 *
 * Four assertions here are about safety rather than rendering, and they are the ones worth keeping
 * if the rest are ever trimmed: the run affordance is **not rendered at all** while the live pins
 * cannot be read (not merely disabled); the first press arms and sends nothing; the second sends
 * **exactly one** POST, to the exact scoped URL; and an aborted receipt says in so many words that
 * nothing was deleted. Since qits-2138 a fifth: a browser that cannot reach qits-orchestrator —
 * which is private — gets the tunnel hint and no Run, while a 404 for a repository that does not
 * exist stays the "no such repository" it is.
 */
describe('CleanupPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  const plan = (over: Partial<GcRepositoryPlanReportDto> = {}): GcRepositoryPlanReportDto => ({
    repository: 'npm',
    type: 'npm-packages',
    generatedAt: '2026-08-05T12:00:00Z',
    dryRun: true,
    graceWindow: 'P7D',
    executable: true,
    pinFailures: [],
    pins: [
      {
        source: 'qits-cd',
        url: 'http://qits-cd/cd/api/pins',
        answered: true,
        outcome: '4 application pins over 7 image shas',
        readAt: '2026-08-05T12:00:00Z',
        tookMillis: 41,
        pinCount: 4,
        keeps: ['qits-ci:3ff84c05'],
      },
    ],
    configuration: {
      type: 'npm-packages',
      strategy: 'own',
      window: 'P30D',
      rule: 'own: always keep the last 2 released versions of every identity group',
    },
    strategy: 'NpmPackagesGcStrategy',
    note: null,
    error: null,
    dead: [
      {
        repository: 'npm',
        identity: '@qits/thing@1.0.0-main.gab854a1',
        rule: 'superseded and unaccessed for longer than P30D',
      },
    ],
    kept: [
      {
        repository: 'npm',
        identity: '@qits/thing@1.0.0',
        rule: 'among the last 2 released versions of this identity group',
      },
    ],
    sweep: {
      blobCount: 1,
      reclaimableBytes: 43229184,
      withheldByGraceWindow: 0,
      withheldBytes: 0,
      blobIds: ['aa'],
    },
    structural: {
      blobCount: 1,
      reclaimableBytes: 43229184,
      withheldByGraceWindow: 0,
      withheldBytes: 0,
      blobIds: ['aa'],
    },
    untouchable: {
      reason: 'no identity row of any type names these',
      blobCount: 3,
      bytes: 130023424,
      blobIds: [],
    },
    ...over,
  });

  const receipt = (over: Partial<GcRepositorySweepReportDto> = {}): GcRepositorySweepReportDto => ({
    repository: 'npm',
    type: 'npm-packages',
    executedAt: '2026-08-05T12:05:00Z',
    dryRun: false,
    graceWindow: 'P7D',
    aborted: null,
    pins: [],
    strategy: 'NpmPackagesGcStrategy',
    note: null,
    error: null,
    deleted: [
      {
        repository: 'npm',
        identity: '@qits/thing@1.0.0-main.gab854a1',
        rule: 'superseded and unaccessed for longer than P30D',
      },
    ],
    withheldByGraceWindow: [],
    sweep: {
      blobsUnlinked: 1,
      bytesReclaimed: 43229184,
      withheldByGraceWindow: 0,
      withheldBytes: 0,
      stillReferenced: 0,
      alreadyGone: 0,
      unlinkedBlobIds: ['aa'],
    },
    untouchable: {
      reason: 'no identity row of any type names these',
      blobCount: 3,
      bytes: 130023424,
      blobIds: [],
    },
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: QITS_NAVIGATION,
          useValue: {
            tree: signal(
              toNavTree({
                slots: {},
                applications: {
                  'qits-orchestrator': {
                    origin: 'https://orchestrator.qits.example',
                    exposure: 'private',
                  },
                },
              }),
            ),
            failed: signal(false),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function open(repository = 'npm'): Promise<void> {
    harness = await RouterTestingHarness.create(`/repositories/${repository}/cleanup`);
  }

  function page(): HTMLElement {
    return harness.fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return page().textContent ?? '';
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await harness.fixture.whenStable();
    }
  }

  /** The plan read goes out once the orchestrator's URL has resolved — settle first, then answer. */
  async function flushPlan(
    report: GcRepositoryPlanReportDto = plan(),
    repository = 'npm',
  ): Promise<void> {
    await settle();
    http.expectOne(`${ORCHESTRATOR}/${repository}/plan`).flush(report);
  }

  /** Opens the page, arms the run and presses it, leaving the sweep request pending. */
  async function pressRun(): Promise<void> {
    await open();
    await flushPlan();
    await settle();
    press('Run this cleanup');
    await settle();
    press('Delete 1 identity');
    await settle();
  }

  function press(label: string): void {
    const button = Array.from(page().querySelectorAll('button')).find((candidate) =>
      (candidate.textContent ?? '').includes(label),
    );
    button?.click();
  }

  it('reads exactly one request, and shows both halves of the plan', async () => {
    await open();
    await flushPlan();
    await settle();

    http.verify();
    expect(text()).toContain('@qits/thing@1.0.0-main.gab854a1');
    expect(text()).toContain('superseded and unaccessed for longer than P30D');
    expect(text()).toContain('1 identity');
    expect(text()).toContain('41.2 MiB');
    // The configured rule, because "nothing died" reads the same whether the rule is right or the
    // window is a year.
    expect(text()).toContain('last 2 released versions');
    // And the provenance of the keep-set, which is the first thing a review of this plan checks.
    expect(text()).toContain('qits-cd');
  });

  it('shows the kept half only when asked, and it costs no request', async () => {
    await open();
    await flushPlan();
    await settle();

    expect(text()).not.toContain('among the last 2 released versions');

    press('kept, each with the rule that saved it');
    await settle();

    expect(text()).toContain('among the last 2 released versions');
    http.verify();
  });

  it('does not render the run at all while the live pins cannot be read', async () => {
    // Not disabled — absent. A disabled button is a promise that pressing it later acts on what is
    // on screen, and what is on screen in this state is what the rule condemns rather than what a
    // run would take. The plan itself stays fully readable: a review can happen while qits-cd is
    // down.
    await open();
    await flushPlan(
      plan({
        executable: false,
        pinFailures: ['qits-cd deployment pins: connection refused'],
      }),
    );
    await settle();

    expect(text()).toContain('cannot be run right now');
    expect(text()).toContain('qits-cd deployment pins');
    expect(text()).toContain('@qits/thing@1.0.0-main.gab854a1'); // still reviewable
    expect(text()).not.toContain('Run this cleanup');
    expect(
      Array.from(page().querySelectorAll('button')).some((button) =>
        (button.textContent ?? '').includes('Delete'),
      ),
    ).toBe(false);
  });

  it('arms on the first press and sends nothing, then sends exactly one POST on the second', async () => {
    await open();
    await flushPlan();
    await settle();

    press('Run this cleanup');
    await settle();

    // Asking is free, and the confirm restates the exact figures the press will act on.
    http.verify();
    expect(text()).toContain('This is not reversible');
    expect(text()).toContain('Delete 1 identity · 41.2 MiB');

    press('Delete 1 identity');
    await settle();

    const request = http.expectOne(`${ORCHESTRATOR}/npm/sweep`);
    expect(request.request.method).toBe('POST');
    // No machine token: the bearer is the interceptor's, and the guard is qits-orchestrator's.
    expect(request.request.headers.has('X-Artifacts-Token')).toBe(false);
    request.flush(receipt());
    await settle();

    // Exactly one POST, and no re-read: the sweep answers with its own receipt.
    http.verify();
  });

  it('replaces the plan with the receipt once a run has happened', async () => {
    await open();
    await flushPlan();
    await settle();

    press('Run this cleanup');
    await settle();
    press('Delete 1 identity');
    await settle();
    http.expectOne(`${ORCHESTRATOR}/npm/sweep`).flush(receipt());
    await settle();

    expect(text()).toContain('What the run did');
    expect(text()).toContain('1 identity');
    expect(text()).toContain('41.2 MiB');
    // The plan is gone: two answers to the same question, one of which is now false.
    expect(text()).not.toContain('Would be deleted');
    expect(text()).not.toContain('Run this cleanup');

    press('Re-read the plan');
    await settle();
    await flushPlan(
      plan({ dead: [], kept: [], sweep: { ...plan().sweep, blobCount: 0, reclaimableBytes: 0 } }),
    );
    await settle();

    expect(text()).toContain('Would be deleted');
    expect(text()).toContain('There is nothing to run');
  });

  it('renders an aborted receipt as what it is: nothing deleted, and why', async () => {
    await open();
    await flushPlan();
    await settle();

    press('Run this cleanup');
    await settle();
    press('Delete 1 identity');
    await settle();
    http.expectOne(`${ORCHESTRATOR}/npm/sweep`).flush(
      receipt({
        aborted:
          'the run was aborted before anything was deleted: qits-ci daemon pin: connection refused',
        deleted: [],
        sweep: {
          blobsUnlinked: 0,
          bytesReclaimed: 0,
          withheldByGraceWindow: 0,
          withheldBytes: 0,
          stillReferenced: 0,
          alreadyGone: 0,
          unlinkedBlobIds: [],
        },
      }),
    );
    await settle();

    expect(text()).toContain('nothing was deleted');
    expect(text()).toContain('qits-ci daemon pin');
  });

  it('says a gc run is active in the service’s own words, and that nothing was deleted', async () => {
    await pressRun();
    http
      .expectOne(`${ORCHESTRATOR}/npm/sweep`)
      .flush(
        { message: 'a gc run is already active: 7f3c' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(text()).toContain('The cleanup did not run — 409 a gc run is already active: 7f3c.');
    expect(text()).toContain('Nothing was deleted.');
    expect(text()).not.toContain('X-Artifacts-Token');
    expect(text()).toContain('Would be deleted'); // the plan is still on screen
  });

  it('does not claim nothing was deleted when no receipt came back', async () => {
    // A 502 is qits-orchestrator failing to get qits-artifacts' answer, which can be an answer lost
    // after the sweep began. The page says what it knows: the message, and to re-read.
    await pressRun();
    http
      .expectOne(`${ORCHESTRATOR}/npm/sweep`)
      .flush(
        { message: 'qits-artifacts could not be asked: timed out' },
        { status: 502, statusText: 'Bad Gateway' },
      );
    await settle();

    expect(text()).toContain('502 qits-artifacts could not be asked: timed out');
    expect(text()).toContain('re-read the plan');
    expect(text()).not.toContain('Nothing was deleted.');
  });

  it('shows the tunnel hint and no run when qits-orchestrator cannot be reached', async () => {
    // A browser off the tunnel: the public edge's refusal carries no CORS headers, so the read
    // fails as a network error. There is no plan to review, so there is nothing to press.
    await open();
    await settle();
    http
      .expectOne(`${ORCHESTRATOR}/npm/plan`)
      .error(new ProgressEvent('error'), { status: 0, statusText: '' });
    await settle();

    expect(text()).toContain(QITS_PRIVATE_APP_HINT);
    expect(text()).toContain('Nothing was deleted');
    expect(text()).not.toContain('Could not load the cleanup plan');
    expect(text()).not.toContain('Run this cleanup');
    expect(text()).not.toContain('Would be deleted');
  });

  it('reads the public edge’s own 404 as unreachable, not as no such repository', async () => {
    await open();
    await settle();
    http
      .expectOne(`${ORCHESTRATOR}/npm/plan`)
      .flush('`orchestrator` is not an application this edge routes. Configured: [ci]\n', {
        status: 404,
        statusText: 'Not Found',
      });
    await settle();

    expect(text()).toContain(QITS_PRIVATE_APP_HINT);
    expect(text()).not.toContain('Could not load the cleanup plan');
  });

  it('hides the run once the sweep itself finds qits-orchestrator unreachable', async () => {
    await pressRun();
    http
      .expectOne(`${ORCHESTRATOR}/npm/sweep`)
      .flush('`orchestrator` is not an application this edge routes. Configured: [ci]\n', {
        status: 404,
        statusText: 'Not Found',
      });
    await settle();

    expect(text()).toContain(QITS_PRIVATE_APP_HINT);
    expect(text()).toContain('Nothing was deleted.');
    expect(
      Array.from(page().querySelectorAll('button')).some((button) =>
        (button.textContent ?? '').includes('Delete'),
      ),
    ).toBe(false);
  });

  it('does not claim nothing was deleted when the sweep fails as a network error', async () => {
    // The plan arrived, so the tunnel was up a moment ago; a network error now cannot tell a
    // request that never left from an answer cut off on the way back.
    await pressRun();
    http.expectOne(`${ORCHESTRATOR}/npm/sweep`).error(new ProgressEvent('error'), { status: 0 });
    await settle();

    expect(text()).toContain('No receipt came back');
    expect(text()).toContain(QITS_PRIVATE_APP_HINT);
    expect(text()).not.toContain('Nothing was deleted.');
    expect(text()).not.toContain('Run this cleanup');
  });

  it('says a repository nobody collects is not collected, and offers no run', async () => {
    await open('clips');
    await flushPlan(
      plan({
        repository: 'clips',
        type: 'ci-videos',
        strategy: null,
        note: 'excluded by configuration: no engine is configured for this type',
        dead: [],
        kept: [],
      }),
      'clips',
    );
    await settle();

    expect(text()).toContain('Nothing collects this repository');
    expect(text()).toContain('excluded by configuration');
    expect(text()).not.toContain('Run this cleanup');
  });

  it('reports a repository that does not exist rather than drawing an empty plan', async () => {
    // qits-artifacts' 404, handed on verbatim by qits-orchestrator: a real "no such repository",
    // and not the tunnel hint — the envelope is JSON, not the edge's sentence.
    await open('nope');
    await settle();
    http
      .expectOne(`${ORCHESTRATOR}/nope/plan`)
      .flush(
        { message: 'No such artifacts repository: nope' },
        { status: 404, statusText: 'Not Found' },
      );
    await settle();

    expect(text()).toContain('Could not load the cleanup plan');
    expect(text()).toContain('No such artifacts repository');
    expect(text()).not.toContain('Would be deleted');
    expect(text()).not.toContain(QITS_PRIVATE_APP_HINT);
  });
});
