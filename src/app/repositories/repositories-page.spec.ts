import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import type { ArtifactRepositoryDto, StoreSummaryDto } from '../api/dto';

/**
 * The overview, one state at a time.
 *
 * Two assertions here are about honesty rather than rendering, and they are the ones worth keeping
 * if the rest ever get trimmed: the page reads **two** requests and no more, whatever the store
 * holds — so the cost of the front door does not grow with the number of repositories — and every
 * byte figure it draws arrives with a unit and a stated kind.
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

  it('reads exactly two requests, and none per repository', async () => {
    await open();
    flushRepositories([
      repository(),
      repository({ name: 'npmjs', type: 'npm-proxy', itemCount: 710, sizeBytes: 171952091 }),
      repository({ name: 'npm', type: 'npm-packages', itemCount: 2, sizeBytes: 87040 }),
      repository({ name: 'ci-screenshots', type: 'ci-screenshots', itemCount: 0, sizeBytes: 0 }),
      repository({ name: 'ci-videos', type: 'ci-videos', itemCount: 0, sizeBytes: 0 }),
    ]);
    flushSummary();
    await settle();

    // Five repositories on screen and no further traffic: the variable term of the budget is zero.
    http.verify();
    expect(text()).toContain('5 repositories');
  });

  it('draws every repository with the noun its own type counts', async () => {
    await open();
    flushRepositories([
      repository(),
      repository({ name: 'npmjs', type: 'npm-proxy', itemCount: 710, sizeBytes: 171952091 }),
      repository({ name: 'ci-videos', type: 'ci-videos', itemCount: 0, sizeBytes: 0 }),
    ]);
    flushSummary();
    await settle();

    expect(text()).toContain('10 images');
    expect(text()).toContain('710 packages');
    expect(text()).toContain('0 records');
  });

  it('labels the unit on every size it draws', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
    await settle();

    expect(text()).toContain('4.04 GiB');
    expect(text()).toContain('Size (union)');
  });

  it('names all three OCI figures, and the orphans no other view can show', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
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
    await settle();

    expect(text()).toContain('2 of these are mirror namespaces.');
    expect(text()).toContain('1 image'); // the mirror rows count images, like the hosted one
  });

  it('reports the packument cost beside the tarballs it dwarfs', async () => {
    await open();
    flushRepositories([repository()]);
    flushSummary();
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
    await settle();

    expect(text()).toContain('The git host is not in this table');
  });

  it('keeps the table standing when only the summary fails, and offers it its own retry', async () => {
    await open();
    flushRepositories([repository()]);
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

  it('reports a failed repository list rather than drawing an empty store', async () => {
    await open();
    http
      .expectOne('/artifacts/api/repositories')
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    flushSummary();
    await settle();

    expect(text()).toContain('Could not load the repositories');
    expect(text()).not.toContain('This store holds no repositories at all.');
  });

  it('says so out loud when the store genuinely has nothing in it', async () => {
    await open();
    flushRepositories([]);
    flushSummary();
    await settle();

    expect(text()).toContain('This store holds no repositories at all.');
  });
});
