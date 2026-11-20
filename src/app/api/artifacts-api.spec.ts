import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QITS_NAVIGATION, toNavTree } from '@qits/ui-components';
import { ArtifactsApi, orchestratorUnreachable } from './artifacts-api';

const ORCHESTRATOR_ORIGIN = 'https://orchestrator.qits.example';

/**
 * The paths and the envelopes, asserted once here so the pages' specs can be about rendering.
 *
 * The store's reads are same-origin absolute paths on purpose — the SPA is served by the very
 * service it reads from, behind the same gateway, and these reads carry no credential at all. The
 * cleanup listing is the exception (qits-2138): it goes to qits-orchestrator's own origin, as the
 * navigation names it, and carries the bearer `qitsBearerInterceptor` adds (installed in
 * `app.config.ts`, not under test here). The per-repository plan and the run themselves moved off
 * this application to the landing app (qits-2329) and are not under test here any more.
 *
 * The backend is being built against this contract in parallel, so this file is where the contract
 * is pinned: a path that changes shape breaks here first, loudly, rather than at runtime.
 */
describe('ArtifactsApi', () => {
  let api: ArtifactsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: QITS_NAVIGATION,
          useValue: {
            tree: signal(
              toNavTree({
                slots: {},
                applications: {
                  'qits-orchestrator': { origin: ORCHESTRATOR_ORIGIN, exposure: 'private' },
                },
              }),
            ),
            failed: signal(false),
          },
        },
      ],
    });
    api = TestBed.inject(ArtifactsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('unwraps the repositories, type and counts and all', async () => {
    const repositories = api.repositories();
    http.expectOne('/artifacts/api/repositories').flush({
      repositories: [
        {
          name: 'qits',
          type: 'oci-images',
          createdAt: '2026-05-01T00:00:00Z',
          itemCount: 10,
          sizeBytes: 4337916518,
        },
        {
          name: 'ci-videos',
          type: 'ci-videos',
          createdAt: '2026-05-01T00:00:00Z',
          itemCount: 0,
          sizeBytes: 0,
        },
      ],
    });
    await expect(repositories).resolves.toMatchObject([
      { name: 'qits', type: 'oci-images', itemCount: 10 },
      { name: 'ci-videos', type: 'ci-videos', itemCount: 0 },
    ]);
  });

  it('keeps a null size as null, because unknown is not zero', async () => {
    const repositories = api.repositories();
    http.expectOne('/artifacts/api/repositories').flush({
      repositories: [
        { name: 'npm', type: 'npm-packages', createdAt: null, itemCount: 2, sizeBytes: null },
      ],
    });
    await expect(repositories).resolves.toMatchObject([{ sizeBytes: null }]);
  });

  it('reads the store summary bare, not enveloped', async () => {
    const summary = api.storeSummary();
    http.expectOne('/artifacts/api/store/summary').flush({
      ociPerImageSumBytes: 4681572352,
      ociUnionBytes: 4337916518,
      orphanBytes: 130023424,
      npmPublishedBytes: 87040,
      diskTotalBytes: 4637355442,
    });
    await expect(summary).resolves.toMatchObject({
      ociUnionBytes: 4337916518,
      orphanBytes: 130023424,
    });
  });

  it('unwraps the images of an OCI repository', async () => {
    const images = api.images('qits');
    http
      .expectOne('/artifacts/api/repositories/qits/images')
      .flush({ images: [{ name: 'qits-ci', tagCount: 22, manifestCount: 22, sizeBytes: 512 }] });
    await expect(images).resolves.toMatchObject([{ name: 'qits-ci', tagCount: 22 }]);
  });

  it('reports a non-OCI repository as the 400 it is, rather than an empty list', async () => {
    const images = api.images('npm');
    http
      .expectOne('/artifacts/api/repositories/npm/images')
      .flush({ message: 'not an oci repository' }, { status: 400, statusText: 'Bad Request' });
    await expect(images).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  it('reports an unknown repository as a 404', async () => {
    const images = api.images('nope');
    http
      .expectOne('/artifacts/api/repositories/nope/images')
      .flush({ message: 'no such repository' }, { status: 404, statusText: 'Not Found' });
    await expect(images).rejects.toMatchObject({ status: 404 });
  });

  it('encodes inclusive artifact filters and preserves nullable access times', async () => {
    const records = api.artifactRecords('ci-videos', {
      accessedBefore: '2026-08-01T00:00:00Z',
      createdAfter: '2026-07-01T00:00:00Z',
      minSize: 1024,
      maxSize: 4096,
      neverAccessed: true,
    });
    const request = http.expectOne(
      (candidate) => candidate.url === '/artifacts/api/repositories/ci-videos/blobs',
    );
    expect(request.request.params.get('accessed-before')).toBe('2026-08-01T00:00:00Z');
    expect(request.request.params.get('created-after')).toBe('2026-07-01T00:00:00Z');
    expect(request.request.params.get('min-size')).toBe('1024');
    expect(request.request.params.get('max-size')).toBe('4096');
    expect(request.request.params.get('never-accessed')).toBe('true');
    request.flush({
      records: [
        {
          id: 'abc',
          repository: 'ci-videos',
          mediatype: 'video/webm',
          size: 2048,
          createdAt: '2026-07-31T14:06:23Z',
          accessedAt: null,
          metadata: {},
        },
      ],
    });
    await expect(records).resolves.toMatchObject([{ accessedAt: null }]);
  });

  it('unwraps the packages of an npm repository', async () => {
    const packages = api.packages('npm');
    http.expectOne('/artifacts/api/repositories/npm/packages').flush({
      packages: [{ name: '@qits/ui-components', versionCount: 4, latest: '0.0.4' }],
    });
    await expect(packages).resolves.toMatchObject([
      { name: '@qits/ui-components', latest: '0.0.4' },
    ]);
  });

  it('encodes the scope separator in a package name, slash and all', async () => {
    const versions = api.versions('npm', '@qits/ui-components');
    const request = http.expectOne(
      '/artifacts/api/repositories/npm/packages/%40qits%2Fui-components/versions',
    );
    expect(request.request.url).toContain('%2F');
    request.flush({
      versions: [
        {
          version: '0.0.4',
          tarballSizeBytes: 20480,
          publishedAt: '2026-07-31T09:00:00Z',
          distTags: ['latest'],
        },
      ],
    });
    await expect(versions).resolves.toMatchObject([{ version: '0.0.4', distTags: ['latest'] }]);
  });

  it('keeps an unmeasured version’s size and date as nulls', async () => {
    const versions = api.versions('npm', '@qits/ui-components');
    http
      .expectOne('/artifacts/api/repositories/npm/packages/%40qits%2Fui-components/versions')
      .flush({
        versions: [{ version: '0.0.5', tarballSizeBytes: null, publishedAt: null, distTags: [] }],
      });
    await expect(versions).resolves.toMatchObject([{ tarballSizeBytes: null, publishedAt: null }]);
  });

  it('unwraps the daemons of a daemon-binaries repository', async () => {
    const daemons = api.daemons('daemons');
    http.expectOne('/artifacts/api/repositories/daemons/daemons').flush({
      daemons: [
        {
          name: 'qits-agent',
          versionCount: 3,
          latestVersion: '2026.828.202327',
          latestPublishedAt: '2026-08-28T20:23:27Z',
          sizeBytes: 41943040,
        },
      ],
    });
    await expect(daemons).resolves.toMatchObject([{ name: 'qits-agent', versionCount: 3 }]);
  });

  it('unwraps the documentation sites, which arrive under `sites` and not `docs`', async () => {
    const sites = api.docsSites('docs');
    http.expectOne('/artifacts/api/repositories/docs/docs').flush({
      sites: [
        {
          name: '@userflows/qits-artifacts',
          versionCount: 2,
          latestVersion: '2026.828.202327',
          latestPublishedAt: '2026-08-28T20:23:27Z',
          sizeBytes: 1048576,
        },
      ],
    });
    await expect(sites).resolves.toMatchObject([
      { name: '@userflows/qits-artifacts', versionCount: 2 },
    ]);
  });

  /** Lets an awaited cross-origin URL resolve, so a request that is going out has gone out. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  it('reads every repository’s cleanup from qits-orchestrator, on its own origin', async () => {
    const plan = api.gcRepositories();
    await settle();
    const request = http.expectOne(
      `${ORCHESTRATOR_ORIGIN}/orchestrator/api/artifacts/repositories`,
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      generatedAt: '2026-08-05T12:00:00Z',
      executable: true,
      pinFailures: [],
      graceWindow: 'P7D',
      repositories: [],
    });
    await expect(plan).resolves.toMatchObject({ executable: true, repositories: [] });
  });

  describe('orchestratorUnreachable', () => {
    const answer = (status: number, error: unknown) =>
      new HttpErrorResponse({ status, error, url: `${ORCHESTRATOR_ORIGIN}/orchestrator/api/x` });

    it('reads a network error and the public edge’s refusals as unreachable', () => {
      expect(orchestratorUnreachable(answer(0, new ProgressEvent('error')))).toBe(true);
      expect(orchestratorUnreachable(answer(421, '`orchestrator` is served only by…'))).toBe(true);
      expect(
        orchestratorUnreachable(
          answer(404, '`orchestrator` is not an application this edge routes. Configured: [ci]\n'),
        ),
      ).toBe(true);
    });

    it('keeps a repository that does not exist a real 404, and a refusal a refusal', () => {
      expect(
        orchestratorUnreachable(answer(404, { message: 'No such artifacts repository: nope' })),
      ).toBe(false);
      expect(orchestratorUnreachable(answer(409, { message: 'a gc run is already active' }))).toBe(
        false,
      );
      expect(
        orchestratorUnreachable(answer(502, { message: 'qits-artifacts could not be asked' })),
      ).toBe(false);
      expect(orchestratorUnreachable(new Error('boom'))).toBe(false);
    });
  });

  it('rejects with the HttpErrorResponse, so callers can read the status', async () => {
    const summary = api.storeSummary();
    http
      .expectOne('/artifacts/api/store/summary')
      .flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(summary).rejects.toBeInstanceOf(HttpErrorResponse);
  });
});
