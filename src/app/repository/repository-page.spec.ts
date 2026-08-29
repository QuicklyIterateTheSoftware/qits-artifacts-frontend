import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import type { ArtifactRepositoryDto } from '../api/dto';

/**
 * One repository, drawn by its type.
 *
 * The load budget is what most of these assert: `1 + 1`, where the variable term is **zero** for
 * the two ci types. A page that spun on a listing endpoint those types do not have would look like
 * a slow page rather than a wrong one, which is exactly the failure `idle` exists to prevent.
 */
describe('RepositoryPage', () => {
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

  const store: readonly ArtifactRepositoryDto[] = [
    repository(),
    repository({ name: 'npm', type: 'npm-packages', itemCount: 2, sizeBytes: 87040 }),
    repository({ name: 'maven', type: 'maven-packages', itemCount: 3, sizeBytes: 112640 }),
    repository({ name: 'daemons', type: 'daemon-binaries', itemCount: 3, sizeBytes: 41943040 }),
    repository({ name: 'docs', type: 'docs', itemCount: 2, sizeBytes: 1048576 }),
    repository({ name: 'ci-videos', type: 'ci-videos', itemCount: 0, sizeBytes: 0 }),
  ];

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

  async function open(name: string): Promise<void> {
    harness = await RouterTestingHarness.create(`/repositories/${name}`);
  }

  function text(): string {
    return (harness.fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await harness.fixture.whenStable();
    }
  }

  function flushStore(): void {
    http.expectOne('/artifacts/api/repositories').flush({ repositories: store });
  }

  it('lists images for an OCI repository, with the per-image union as the size', async () => {
    await open('qits');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/qits/images').flush({
      images: [
        { name: 'qits-ci', tagCount: 22, manifestCount: 22, sizeBytes: 512180224 },
        { name: 'qits-gateway', tagCount: 4, manifestCount: 5, sizeBytes: 268435456 },
      ],
    });
    await settle();

    http.verify();
    expect(text()).toContain('Size (per-image union)');
    expect(text()).toContain('488 MiB');
    expect(text()).toContain('22 tags · 22 manifests');
  });

  it('warns that adding the image column up over-counts the shared blobs', async () => {
    await open('qits');
    flushStore();
    await settle();
    http
      .expectOne('/artifacts/api/repositories/qits/images')
      .flush({ images: [{ name: 'qits-ci', tagCount: 1, manifestCount: 1, sizeBytes: 1024 }] });
    await settle();

    expect(text()).toContain('over-counts');
    expect(text()).toContain('store-wide union');
  });

  it('lists packages for the hosted npm registry', async () => {
    await open('npm');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/npm/packages').flush({
      packages: [{ name: '@qits/ui-components', versionCount: 4, latest: '0.0.4' }],
    });
    await settle();

    http.verify();
    expect(text()).toContain('@qits/ui-components');
    expect(text()).toContain('0.0.4');
  });

  it('lists CI artifacts with created and never-accessed timestamps', async () => {
    await open('ci-videos');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/ci-videos/blobs').flush({
      records: [
        {
          id: 'sha256:abcdef0123456789',
          repository: 'ci-videos',
          mediatype: 'video/webm',
          size: 2048,
          createdAt: '2026-07-31T14:06:23Z',
          accessedAt: null,
          metadata: { 'git.branch.name': 'main' },
        },
      ],
    });
    await settle();

    http.verify();
    expect(text()).toContain('video/webm');
    expect(text()).toContain('2.00 KiB');
    expect(text()).toContain('31 Jul 2026 14:06:23Z');
    expect(text()).toContain('Never');
  });

  it('submits repository artifact bounds and access state to the server', async () => {
    await open('ci-videos');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/ci-videos/blobs').flush({ records: [] });
    await settle();

    const page = harness.fixture.nativeElement as HTMLElement;
    const minimum = page.querySelector<HTMLInputElement>('input[name="minSize"]')!;
    minimum.value = '4096';
    minimum.dispatchEvent(new Event('input'));
    const access = page.querySelector<HTMLSelectElement>('select[name="accessState"]')!;
    access.value = 'accessed';
    access.dispatchEvent(new Event('change'));
    page.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/ci-videos/blobs'));
    expect(request.request.params.get('min-size')).toBe('4096');
    expect(request.request.params.get('never-accessed')).toBe('false');
    request.flush({ records: [] });
  });

  it('says a name that is not in the store is not in the store', async () => {
    await open('missing');
    flushStore();
    await settle();

    http.verify();
    expect(text()).toContain('There is no repository called');
  });

  it('drills into Maven coordinates instead of stopping at the repository', async () => {
    await open('maven');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/maven/maven-packages').flush({ packages: [
      { name: 'eu.wohlben.qits:qits-eventstream', versionCount: 2, sizeBytes: 112640 },
    ] });
    await settle();
    expect(text()).toContain('eu.wohlben.qits:qits-eventstream');
    expect(text()).toContain('110 KiB');
    const link = (harness.fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('tbody a');
    expect(link?.getAttribute('href')).toContain('maven-packages');
  });

  it('lists daemons, and costs one request plus one to do it', async () => {
    await open('daemons');
    flushStore();
    await settle();
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
    await settle();

    // 1 + 1: the type read, then the one listing that answer chose. Nothing per row.
    http.verify();
    expect(text()).toContain('qits-agent');
    expect(text()).toContain('2026.828.202327');
    expect(text()).toContain('40.0 MiB');
    expect(text()).toContain('daemon-binaries');
    expect(text()).toContain('3 versions');
    expect(text()).toContain("The platform's own daemon executables");

    const link = (harness.fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'tbody a',
    );
    expect(link?.getAttribute('href')).toBe('/repositories/daemons/daemons/qits-agent');
  });

  it('lists documentation sites, and costs one request plus one to do it', async () => {
    await open('docs');
    flushStore();
    await settle();
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
    await settle();

    http.verify();
    expect(text()).toContain('@userflows/qits-artifacts');
    expect(text()).toContain('1.00 MiB');
    // The badge and the summary, both of which a stale type union silently drops.
    expect(text()).toContain('docs');
    expect(text()).toContain('Published documentation bundles');
    // itemCount is published versions — not sites, not files.
    expect(text()).toContain('2 versions');

    const link = (harness.fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'tbody a',
    );
    expect(link?.getAttribute('href')).toContain('%2F');
    expect(link?.getAttribute('href')).toContain('/repositories/docs/docs/');
  });

  /**
   * The regression this listing was built to end. `docs` shipped on the wire while the type union
   * here still said six, so a repository full of published bundles fell through to the fallback and
   * told its reader it was an empty CI shape — a sentence about the golden-diff loop, under a badge
   * for a type that has nothing to do with it.
   */
  it('never tells a docs repository it is an empty CI shape', async () => {
    await open('docs');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/docs/docs').flush({ sites: [] });
    await settle();

    expect(text()).not.toContain('golden-diff loop');
    expect(text()).not.toContain('A shape with no content');
    expect(text()).not.toContain('screenshot records');
    expect(text()).not.toContain('has no listing in this explorer yet');
    // Loaded and holding nothing is still said out loud, in the listing's own words.
    expect(text()).toContain('No documentation sites match this search.');
  });

  it('filters the daemon rows through the same search the other listings use', async () => {
    await open('daemons');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/daemons/daemons').flush({
      daemons: [
        {
          name: 'qits-agent',
          versionCount: 1,
          latestVersion: '1',
          latestPublishedAt: '2026-08-28T20:23:27Z',
          sizeBytes: 1024,
        },
        {
          name: 'qits-runner',
          versionCount: 1,
          latestVersion: '1',
          latestPublishedAt: '2026-08-28T20:23:27Z',
          sizeBytes: 1024,
        },
      ],
    });
    await settle();

    const page = harness.fixture.nativeElement as HTMLElement;
    const search = page.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'runner';
    search.dispatchEvent(new Event('input'));
    await settle();

    // A client-side filter over rows already in hand — it costs no request.
    http.verify();
    expect(text()).toContain('qits-runner');
    expect(text()).not.toContain('qits-agent');
  });

  it('reports a 400 from the images endpoint rather than showing an empty repository', async () => {
    await open('qits');
    flushStore();
    await settle();
    http
      .expectOne('/artifacts/api/repositories/qits/images')
      .flush({ message: 'not an oci repository' }, { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(text()).toContain('Could not load the images');
    expect(text()).toContain('400');
  });

  it('links each image to its own page', async () => {
    await open('qits');
    flushStore();
    await settle();
    http
      .expectOne('/artifacts/api/repositories/qits/images')
      .flush({ images: [{ name: 'qits-ci', tagCount: 1, manifestCount: 1, sizeBytes: 1024 }] });
    await settle();

    const link = (harness.fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'tbody a',
    );
    expect(link?.getAttribute('href')).toBe('/repositories/qits/images/qits-ci');
  });

  it('encodes a scoped package name into the link, slash and all', async () => {
    await open('npm');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/npm/packages').flush({
      packages: [{ name: '@qits/ui-components', versionCount: 4, latest: '0.0.4' }],
    });
    await settle();

    const link = (harness.fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'tbody a',
    );
    expect(link?.getAttribute('href')).toContain('%2F');
  });
});
