import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import type { ArtifactRepositoryDto, NpmVersionDto } from '../api/dto';

/**
 * The versions of one package.
 *
 * Two behaviours are worth the file on their own: a dist-tag column that appears only where
 * dist-tags mean something, and a null size that is drawn as *unmeasured* rather than as zero —
 * "0 B" would be a claim about disk that nobody made.
 */
describe('PackagePage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  const repository = (over: Partial<ArtifactRepositoryDto> = {}): ArtifactRepositoryDto => ({
    name: 'npm',
    type: 'npm-packages',
    createdAt: '2026-05-01T00:00:00Z',
    itemCount: 2,
    sizeBytes: 87040,
    ...over,
  });

  const store: readonly ArtifactRepositoryDto[] = [repository()];

  const version = (over: Partial<NpmVersionDto> = {}): NpmVersionDto => ({
    version: '0.0.4',
    tarballSizeBytes: 20480,
    publishedAt: '2026-07-31T09:00:00Z',
    distTags: ['latest'],
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

  async function open(repo: string, packageName: string): Promise<void> {
    harness = await RouterTestingHarness.create(
      `/repositories/${repo}/packages/${encodeURIComponent(packageName)}`,
    );
  }

  function text(): string {
    return (harness.fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** The column headings, which is where "is the dist-tag column drawn?" is actually answered. */
  function headers(): string[] {
    const page = harness.fixture.nativeElement as HTMLElement;
    return Array.from(page.querySelectorAll('thead th')).map(
      (cell) => cell.textContent?.trim() ?? '',
    );
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

  it('reads exactly two requests, and none per version', async () => {
    await open('npm', '@qits/ui-components');
    flushStore();
    http
      .expectOne('/artifacts/api/repositories/npm/packages/%40qits%2Fui-components/versions')
      .flush({ versions: [version(), version({ version: '0.0.3', distTags: [] })] });
    await settle();

    http.verify();
    expect(text()).toContain('2 versions');
    expect(text()).toContain('published to this platform');
  });

  it('carries a scoped name through the URL and back out intact', async () => {
    await open('npm', '@qits/ui-components');
    flushStore();
    http
      .expectOne('/artifacts/api/repositories/npm/packages/%40qits%2Fui-components/versions')
      .flush({ versions: [version()] });
    await settle();

    expect(text()).toContain('@qits/ui-components');
  });

  it('shows dist-tags for a hosted package, where they mean something', async () => {
    await open('npm', '@qits/ui-components');
    flushStore();
    http
      .expectOne('/artifacts/api/repositories/npm/packages/%40qits%2Fui-components/versions')
      .flush({ versions: [version()] });
    await settle();

    expect(text()).toContain('Dist-tags');
    expect(text()).toContain('latest');
    expect(text()).toContain('20.0 KiB');
  });

  it('draws an unmeasured tarball as unmeasured, never as zero', async () => {
    await open('npm', 'zone.js');
    flushStore();
    http.expectOne('/artifacts/api/repositories/npm/packages/zone.js/versions').flush({
      versions: [version({ version: '0.15.0', tarballSizeBytes: null, publishedAt: null })],
    });
    await settle();

    expect(text()).toContain('not measured');
    expect(text()).not.toContain('0 B');
  });

  it('totals nothing', async () => {
    await open('npm', 'a');
    flushStore();
    http
      .expectOne('/artifacts/api/repositories/npm/packages/a/versions')
      .flush({ versions: [version(), version({ version: '0.0.3' })] });
    await settle();

    expect(text()).toContain('they are still not totalled here');
    expect((harness.fixture.nativeElement as HTMLElement).querySelector('tfoot')).toBeNull();
  });

  it('reports a failed version read rather than an empty package', async () => {
    await open('npm', 'a');
    flushStore();
    http
      .expectOne('/artifacts/api/repositories/npm/packages/a/versions')
      .flush({ message: 'no such package' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(text()).toContain('Could not load the versions');
    expect(text()).toContain('404');
  });

  it('still lists the versions when the type read fails — it only loses the framing', async () => {
    await open('npm', 'a');
    http
      .expectOne('/artifacts/api/repositories')
      .flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    http
      .expectOne('/artifacts/api/repositories/npm/packages/a/versions')
      .flush({ versions: [version()] });
    await settle();

    expect(text()).toContain('0.0.4');
    // The column is gone from the table rather than filled with blanks that read as "no tags
    // point here".
    expect(headers()).toEqual(['Version', 'Tarball', 'Published']);
    expect(text()).not.toContain('Dist-tags');
    expect(text()).not.toContain('published to this platform');
  });
});
