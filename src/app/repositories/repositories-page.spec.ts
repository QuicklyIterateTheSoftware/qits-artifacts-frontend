import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import type {
  ArtifactRepositoryDto,
  GcRepositoriesPlanResponse,
  GcRepositoryPlanSummaryDto,
  StoreSummaryDto,
} from '../api/dto';

/**
 * The overview, one state at a time.
 *
 * Three assertions here are about honesty rather than rendering, and they are the ones worth
 * keeping if the rest ever get trimmed: the page reads **three** requests and no more, whatever the
 * store holds — so the cost of the front door does not grow with the number of repositories — every
 * byte figure it draws arrives with a unit and a stated kind, and a zero in the Cleanup column is
 * never drawn for a repository whose plan was refused or never computed.
 */
describe('RepositoriesPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  const repository = (over: Partial<ArtifactRepositoryDto> = {}): ArtifactRepositoryDto => ({
    name: 'qits',
    type: 'oci-images',
    createdAt: '2026-05-01T00:00:00Z',
    itemCount: 10,
    sizeBytes: 4337916518,
    ...over,
  });

  const summary: StoreSummaryDto = {
    ociPerImageSumBytes: 4681572352,
    ociUnionBytes: 4337916518,
    ociMirrorBytes: 4865981,
    orphanBytes: 130023424,
    npmPublishedBytes: 87040,
    npmProxyTarballBytes: 171952091,
    npmProxyPackumentBytes: 650825871,
    diskTotalBytes: 4637355442,
  };

  const cleanupRow = (
    over: Partial<GcRepositoryPlanSummaryDto> = {},
  ): GcRepositoryPlanSummaryDto => ({
    repository: 'qits',
    type: 'oci-images',
    strategy: 'OciImageGcStrategy',
    note: null,
    error: null,
    identitiesCondemned: 0,
    identitiesKept: 0,
    blobsSweepable: 0,
    reclaimableBytes: 0,
    withheldByGraceWindow: 0,
    withheldBytes: 0,
    ...over,
  });

  const cleanup = (
    rows: readonly GcRepositoryPlanSummaryDto[],
    over: Partial<GcRepositoriesPlanResponse> = {},
  ): GcRepositoriesPlanResponse => ({
    generatedAt: '2026-08-05T12:00:00Z',
    executable: true,
    pinFailures: [],
    graceWindow: 'P7D',
    repositories: rows,
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function open(): Promise<void> {
    harness = await RouterTestingHarness.create('/');
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

  function flushRepositories(rows: readonly ArtifactRepositoryDto[]): void {
    http.expectOne('/artifacts/api/repositories').flush({ repositories: rows });
  }

  function flushSummary(figures: StoreSummaryDto = summary): void {
    http.expectOne('/artifacts/api/store/summary').flush(figures);
  }

  function flushCleanup(plan: GcRepositoriesPlanResponse = cleanup([cleanupRow()])): void {
    http.expectOne('/artifacts/api/gc/repositories').flush(plan);
  }

  it('reads exactly three requests, and none per repository', async () => {
    await open();
    flushRepositories([
      repository(),
      repository({ name: 'npmjs', type: 'npm-proxy', itemCount: 710, sizeBytes: 171952091 }),
      repository({ name: 'npm', type: 'npm-packages', itemCount: 2, sizeBytes: 87040 }),
      repository({ name: 'ci-screenshots', type: 'ci-screenshots', itemCount: 0, sizeBytes: 0 }),
      repository({ name: 'ci-videos', type: 'ci-videos', itemCount: 0, sizeBytes: 0 }),
    ]);
    flushSummary();
    flushCleanup(
      cleanup([
        cleanupRow(),
        cleanupRow({ repository: 'npmjs', type: 'npm-proxy' }),
        cleanupRow({ repository: 'npm', type: 'npm-packages' }),
        cleanupRow({ repository: 'ci-screenshots', type: 'ci-screenshots', strategy: null }),
        cleanupRow({ repository: 'ci-videos', type: 'ci-videos', strategy: null }),
      ]),
    );
    await settle();

    // Five repositories on screen and no further traffic: the variable term of the budget is zero,
    // and the cleanup figures are the read that had to be designed for it — a plan per row would
    // have been five censuses and ten cross-service calls to draw one column.
    http.verify();
    expect(text()).toContain('5 repositories');
  });

  it('draws every repository with the noun its own type counts', async () => {
    await open();
    flushRepositories([
      repository(),
      repository({ name: 'npmjs', type: 'npm-proxy', itemCount: 710, sizeBytes: 171952091 }),
      repository({ name: 'maven', type: 'maven-packages', itemCount: 8, sizeBytes: 4096 }),
      repository({ name: 'daemons', type: 'daemon-binaries', itemCount: 3, sizeBytes: 4096 }),
      repository({ name: 'ci-videos', type: 'ci-videos', itemCount: 0, sizeBytes: 0 }),
    ]);
    flushSummary();
    flushCleanup(cleanup([]));
    await settle();

    expect(text()).toContain('10 images');
    expect(text()).toContain('710 packages');
    // The two types this app was blind to for two releases. A missing union entry cost them their
    // noun and their tone, and drew both as "records".
    expect(text()).toContain('8 files');
    expect(text()).toContain('3 versions');
    expect(text()).toContain('0 records');
  });

  it('labels the unit on every size it draws', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('4.04 GiB');
    expect(text()).toContain('Size (union)');
  });

  it('draws what a cleanup would free, with its unit and its noun', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup(
      cleanup([
        cleanupRow({ identitiesCondemned: 3, blobsSweepable: 4, reclaimableBytes: 43229184 }),
      ]),
    );
    await settle();

    expect(text()).toContain('3 identities');
    expect(text()).toContain('41.2 MiB');

    // And the figure is the way in to the review, so the cell is a link to the cleanup page.
    const link = Array.from(page().querySelectorAll('a')).find((candidate) =>
      (candidate.textContent ?? '').includes('3 identities'),
    );
    expect(link?.getAttribute('href')).toBe('/repositories/qits/cleanup');
  });

  it('says a cleanup column is not a total, where the numbers are read', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('that repository alone');
    expect(text()).toContain('must not be added up');
  });

  it('never draws a zero for a plan that was refused or never computed', async () => {
    // Four different facts arrive as the same 0 on the wire, and only one of them means the
    // repository is clean. A column that drew them alike would claim a store nobody has collected
    // is already collected.
    await open();
    flushRepositories([
      repository(),
      repository({ name: 'clips', type: 'ci-videos', itemCount: 0, sizeBytes: 0 }),
      repository({ name: 'npm', type: 'npm-packages', itemCount: 2, sizeBytes: 87040 }),
    ]);
    flushSummary();
    flushCleanup(
      cleanup(
        [
          cleanupRow({ error: 'live pins unavailable — qits-cd deployment pins: refused' }),
          cleanupRow({ repository: 'clips', type: 'ci-videos', strategy: null, note: 'nobody' }),
          cleanupRow({ repository: 'npm', type: 'npm-packages' }),
        ],
        { executable: false, pinFailures: ['qits-cd deployment pins: refused'] },
      ),
    );
    await settle();

    expect(text()).toContain('refused');
    expect(text()).toContain('not collected');
    expect(text()).toContain('nothing');
    // And the reason no cleanup can run at all is said once, run-wide, rather than in every cell:
    // the service reads its pins once per run and aborts whole when one cannot answer.
    expect(text()).toContain('No cleanup can run right now');
    expect(text()).toContain('qits-cd deployment pins');
  });

  it('offers review from every row and a run from none of them', async () => {
    // The review gate, as layout: the list offers the plan, and the press that deletes lives only
    // behind it. A run button beside a figure in a table is the exact shape the standing
    // "nothing sweeps without the dry run being read" rule exists to refuse.
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    const review = Array.from(page().querySelectorAll('a')).find(
      (candidate) => (candidate.textContent ?? '').trim() === 'Review cleanup',
    );
    expect(review?.getAttribute('href')).toBe('/repositories/qits/cleanup');
    expect(text()).not.toContain('Run this cleanup');
  });

  it('says the explorer can delete bytes, and under what condition', async () => {
    // The lede used to promise that nothing here deletes, expires or reclaims a byte. It does now,
    // and the page has to say so where it used to say the opposite.
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('deletes bytes');
    expect(text()).toContain('one repository at a time');
    expect(text()).not.toContain('Nothing here deletes, expires or reclaims a byte');
  });

  it('names all three OCI figures, and the orphans no other view can show', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('Per-image unions, added up');
    expect(text()).toContain('4.36 GiB');
    expect(text()).toContain('Hosted union, counted once');
    expect(text()).toContain('4.04 GiB');
    expect(text()).toContain('Orphaned blobs');
    expect(text()).toContain('124 MiB');
  });

  // The hosted union excludes the mirror namespaces on the wire, so folding the two into one
  // figure — or leaving the mirror bytes out — would misreport the store by whatever the cache
  // holds. Both are named, and the hosted one says it is hosted.
  it('reports the mirrored bytes apart from the hosted union', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('Mirrored from upstream, counted once');
    expect(text()).toContain('4.64 MiB');
    expect(text()).toContain('Hosted union, counted once');
    expect(text()).not.toContain('True union, counted once');
  });

  it('points at the upstream map only when the store actually has mirror namespaces', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).not.toContain('mirror namespaces.');

    const retry = Array.from(page().querySelectorAll('button')).find(
      (button) => (button.textContent ?? '').trim() === 'Refresh',
    );
    retry?.click();
    await settle();
    flushRepositories([
      repository(),
      repository({ name: 'quay', type: 'oci-mirror', itemCount: 1, sizeBytes: 1132219 }),
      repository({ name: 'hub', type: 'oci-mirror', itemCount: 1, sizeBytes: 3733762 }),
    ]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('2 of these are mirror namespaces.');
    expect(text()).toContain('1 image'); // the mirror rows count images, like the hosted one
  });

  it('reports the packument cost beside the tarballs it dwarfs', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('Cached tarballs, from npmjs');
    expect(text()).toContain('164 MiB');
    expect(text()).toContain('Cached packument documents');
    expect(text()).toContain('621 MiB');
  });

  it('explains how each figure was counted only when asked — a free toggle, not a request', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).not.toContain('counted exactly once');

    const toggle = Array.from(page().querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('how each of these was counted'),
    );
    toggle?.click();
    await settle();

    expect(text()).toContain('counted exactly once');
    http.verify(); // opening the explanation cost nothing
  });

  it('says the git host exists and is not measured here', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('The git host is not in this table');
  });

  it('keeps the table standing when only the summary fails, and offers it its own retry', async () => {
    await open();
    flushRepositories([repository()]);
    flushCleanup();
    http
      .expectOne('/artifacts/api/store/summary')
      .flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    await settle();

    expect(text()).toContain('qits');
    expect(text()).toContain('Could not measure the store');

    const retry = Array.from(page().querySelectorAll('button')).find(
      (button) => (button.textContent ?? '').trim() === 'Retry',
    );
    retry?.click();
    await settle();
    flushSummary();
    await settle();

    expect(text()).toContain('Hosted union, counted once');
  });

  it('keeps the table standing when only the cleanup read fails, and draws no zeros for it', async () => {
    // The third read is the newest and the most expensive, and it is not a precondition for
    // anything else on the page. A failed one must leave the store's own figures where they are —
    // and must not let the Cleanup column claim there is nothing to clean.
    await open();
    flushRepositories([repository()]);
    flushSummary();
    http
      .expectOne('/artifacts/api/gc/repositories')
      .flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    await settle();

    expect(text()).toContain('qits');
    expect(text()).toContain('4.04 GiB');
    expect(text()).toContain('Could not read what a cleanup would free');
    expect(text()).not.toContain('nothing');
  });

  it('reports a failed repository list rather than drawing an empty store', async () => {
    await open();
    http
      .expectOne('/artifacts/api/repositories')
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    flushSummary();
    flushCleanup();
    await settle();

    expect(text()).toContain('Could not load the repositories');
    expect(text()).not.toContain('This store holds no repositories at all.');
  });

  it('says so out loud when the store genuinely has nothing in it', async () => {
    await open();
    flushRepositories([]);
    flushSummary();
    flushCleanup(cleanup([]));
    await settle();

    expect(text()).toContain('This store holds no repositories at all.');
  });
});
