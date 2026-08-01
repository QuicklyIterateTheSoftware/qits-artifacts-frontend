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
    repository({ name: 'npmjs', type: 'npm-proxy', itemCount: 710, sizeBytes: 171952091 }),
    repository({ name: 'ci-videos', type: 'ci-videos', itemCount: 0, sizeBytes: 0 }),
    repository({ name: 'quay', type: 'oci-mirror', itemCount: 1, sizeBytes: 1132219 }),
    repository({ name: 'redhat', type: 'oci-mirror', itemCount: 0, sizeBytes: 0 }),
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
    expect(text()).toContain('store-wide unions, hosted and mirrored apart');
  });

  // A mirror namespace's cached content is ordinary manifest and tag rows, so the same listing
  // endpoint answers for it. Drawing it as a listing-less shape would hide rows the service hands
  // out — and the budget stays 1 + 1, because the upstream behind the namespace is a link, not a
  // second read.
  it('lists a mirror namespace’s cached images, and links out to the upstream map', async () => {
    await open('quay');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/quay/images').flush({
      images: [
        {
          name: 'quarkus/ubi9-quarkus-mandrel-builder-image',
          tagCount: 1,
          manifestCount: 2,
          sizeBytes: 1132219,
        },
      ],
    });
    await settle();

    http.verify();
    expect(text()).toContain('quarkus/ubi9-quarkus-mandrel-builder-image');
    expect(text()).toContain('pull-through cache of one upstream container registry');
    expect(text()).toContain('mirror upstreams');
  });

  it('says a never-pulled namespace is lazy, not broken', async () => {
    await open('redhat');
    flushStore();
    await settle();
    http.expectOne('/artifacts/api/repositories/redhat/images').flush({ images: [] });
    await settle();

    expect(text()).toContain('Nothing has been pulled through this namespace yet');
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

  it('keeps cached npm on its own page and says the listing can be short', async () => {
    await open('npmjs');
    flushStore();
    await settle();
    http
      .expectOne('/artifacts/api/repositories/npmjs/packages')
      .flush({ packages: [{ name: 'zone.js', versionCount: 3, latest: null }] });
    await settle();

    // The proxy page never mixes in the two published packages — they are a different repository.
    expect(text()).not.toContain('@qits/ui-components');
    expect(text()).toContain('whose tarball never was is missing from it');
  });

  it('asks for no listing at all for a ci type, and says why it is empty', async () => {
    await open('ci-videos');
    flushStore();
    await settle();

    // The whole assertion: one request, and the second never happens.
    http.verify();
    expect(text()).toContain('A shape with no content');
    expect(text()).toContain('no video records');
    expect(text()).toContain('has never produced anything');
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
