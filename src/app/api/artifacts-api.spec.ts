import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ArtifactsApi } from './artifacts-api';

/**
 * The paths and the envelopes, asserted once here so the pages' specs can be about rendering.
 *
 * These are same-origin absolute paths on purpose — the SPA is served at `/artifacts/` by the very
 * service it reads from, behind the same gateway, and these reads carry no credential at all.
 *
 * The backend is being built against this contract in parallel, so this file is where the contract
 * is pinned: a path that changes shape breaks here first, loudly, rather than at runtime.
 */
describe('ArtifactsApi', () => {
  let api: ArtifactsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
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

  it('unwraps an image’s tags, digest and per-manifest size included', async () => {
    const tags = api.tags('qits', 'qits-ci');
    http.expectOne('/artifacts/api/repositories/qits/images/qits-ci/tags').flush({
      tags: [
        {
          tag: '9f96484aa1c0d1e2f3a4b5c6d7e8f90123456789',
          digest: 'sha256:abc',
          sizeBytes: 512,
          createdAt: '2026-07-31T14:06:23Z',
        },
      ],
    });
    await expect(tags).resolves.toMatchObject([{ digest: 'sha256:abc', sizeBytes: 512 }]);
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

  it('filters tags and lists untagged manifests for cleanup', async () => {
    const tags = api.tags('qits', 'app', { accessedAfter: '2026-07-01T00:00:00Z' });
    const tagRequest = http.expectOne((candidate) => candidate.url.endsWith('/tags'));
    expect(tagRequest.request.params.get('accessed-after')).toBe('2026-07-01T00:00:00Z');
    tagRequest.flush({ tags: [] });
    await expect(tags).resolves.toEqual([]);

    const manifests = api.manifests('qits', 'app', { neverAccessed: true });
    const manifestRequest = http.expectOne((candidate) => candidate.url.endsWith('/manifests'));
    expect(manifestRequest.request.params.get('never-accessed')).toBe('true');
    manifestRequest.flush({
      manifests: [
        {
          digest: 'sha256:abc',
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          sizeBytes: 1,
          createdAt: '2026-07-01T00:00:00Z',
          accessedAt: null,
          tags: [],
        },
      ],
    });
    await expect(manifests).resolves.toMatchObject([{ tags: [], accessedAt: null }]);
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

  it('unwraps a daemon’s versions, digest in the wire spelling and all', async () => {
    const versions = api.daemonVersions('daemons', 'qits-agent');
    http.expectOne('/artifacts/api/repositories/daemons/daemons/qits-agent/versions').flush({
      versions: [
        {
          version: '2026.828.202327',
          digest: 'sha256:0123456789abcdef0123',
          sizeBytes: 20971520,
          publishedAt: '2026-08-28T20:23:27Z',
          accessedAt: null,
        },
      ],
    });
    await expect(versions).resolves.toMatchObject([
      { digest: 'sha256:0123456789abcdef0123', accessedAt: null },
    ]);
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

  // A docs site name carries a separator that is not a path separator, exactly like an npm scope.
  // The browse endpoint takes the encoded spelling; the docs WIRE takes only the literal one, which
  // is why the page builds its bundle link itself rather than through this client.
  it('encodes the separator in a multi-segment site name', async () => {
    const versions = api.docsVersions('docs', '@userflows/qits-artifacts');
    const request = http.expectOne(
      '/artifacts/api/repositories/docs/docs/%40userflows%2Fqits-artifacts/versions',
    );
    expect(request.request.url).toContain('%2F');
    request.flush({
      versions: [
        {
          version: '2026.828.202327',
          fileCount: 54,
          sizeBytes: 524288,
          publishedAt: '2026-08-28T20:23:27Z',
          accessedAt: null,
          metadata: { 'git.branch.name': 'main', 'git.commit.hash': '9f96484aa1c0' },
        },
      ],
    });
    await expect(versions).resolves.toMatchObject([
      { fileCount: 54, metadata: { 'git.branch.name': 'main' } },
    ]);
  });

  it('keeps an empty metadata map as an empty map, not as an absence', async () => {
    const versions = api.docsVersions('docs', 'plain');
    http.expectOne('/artifacts/api/repositories/docs/docs/plain/versions').flush({
      versions: [
        {
          version: '1',
          fileCount: 1,
          sizeBytes: 1,
          publishedAt: '2026-08-28T20:23:27Z',
          accessedAt: null,
          metadata: {},
        },
      ],
    });
    await expect(versions).resolves.toMatchObject([{ metadata: {} }]);
  });

  // The one write this application makes is guarded by a static token it does not hold and must
  // not invent. The call carries no credential and the 401 reaches the caller intact.
  it('sends no token on the sweep, and surfaces the 401 that comes back', async () => {
    const swept = api.gcRepositorySweep('qits');
    const request = http.expectOne('/artifacts/api/gc/repositories/qits/sweep');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('X-Artifacts-Token')).toBe(false);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(
      { message: 'Missing or invalid X-Artifacts-Token' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await expect(swept).rejects.toMatchObject({ status: 401 });
  });

  it('rejects with the HttpErrorResponse, so callers can read the status', async () => {
    const summary = api.storeSummary();
    http
      .expectOne('/artifacts/api/store/summary')
      .flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(summary).rejects.toBeInstanceOf(HttpErrorResponse);
  });
});
