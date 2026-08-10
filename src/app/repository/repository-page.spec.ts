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
    await open('maven');
    flushStore();
    await settle();

    http.verify();
    expect(text()).toContain('There is no repository called');
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
