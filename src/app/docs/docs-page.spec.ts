import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import type { DocsVersionDto } from '../api/dto';

/**
 * The versions of one documentation site.
 *
 * The link out to the bundle is the point of the page and most of this file: it is a real
 * `<a [href]>`, it spells the site's separator **literally** because the docs wire has no
 * percent-encoded form of it, and it lands on `index.html` rather than on the version root.
 */
describe('DocsPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  const version = (over: Partial<DocsVersionDto> = {}): DocsVersionDto => ({
    version: '2026.828.202327',
    fileCount: 54,
    sizeBytes: 524288,
    publishedAt: '2026-08-28T20:23:27Z',
    accessedAt: null,
    metadata: { 'git.branch.name': 'main', 'git.commit.hash': '9f96484aa1c0d1e2f3a4' },
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

  async function open(repo: string, site: string): Promise<void> {
    harness = await RouterTestingHarness.create(
      `/repositories/${repo}/docs/${encodeURIComponent(site)}`,
    );
  }

  function text(): string {
    return (harness.fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function page(): HTMLElement {
    return harness.fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await harness.fixture.whenStable();
    }
  }

  const VERSIONS = '/artifacts/api/repositories/docs/docs/%40userflows%2Fqits-artifacts/versions';

  it('reads exactly one request, and none per version', async () => {
    await open('docs', '@userflows/qits-artifacts');
    http.expectOne(VERSIONS).flush({ versions: [version(), version({ version: '2026.827.1' })] });
    await settle();

    // 1 + 0: the metadata rides on the same answer, which is why branch and commit are columns.
    http.verify();
    expect(text()).toContain('2 versions');
    expect(text()).toContain('512 KiB');
    expect(text()).toContain('54');
  });

  it('carries a multi-segment site name through the URL and back out intact', async () => {
    await open('docs', '@userflows/qits-artifacts');
    http.expectOne(VERSIONS).flush({ versions: [version()] });
    await settle();

    expect(text()).toContain('@userflows/qits-artifacts');
  });

  /**
   * The one link anybody came here for. The browse endpoint above takes either spelling of the
   * separator; the docs WIRE takes only the literal one, so an encoded `%2F` in this href would be
   * a 404 on a page whose whole purpose is opening the bundle.
   */
  it('opens the bundle at index.html, with the site separator left literal', async () => {
    await open('docs', '@userflows/qits-artifacts');
    http.expectOne(VERSIONS).flush({ versions: [version()] });
    await settle();

    const open_ = page().querySelector<HTMLAnchorElement>('[data-testid="open-bundle"]')!;
    expect(open_.getAttribute('href')).toBe(
      '/artifacts/docs/docs/%40userflows/qits-artifacts/-/2026.828.202327/index.html',
    );
    expect(open_.getAttribute('href')).not.toContain('%2F');
    expect(open_.getAttribute('aria-label')).toContain('@userflows/qits-artifacts');
  });

  it('reads the branch and the commit out of the publisher’s metadata', async () => {
    await open('docs', '@userflows/qits-artifacts');
    http.expectOne(VERSIONS).flush({ versions: [version()] });
    await settle();

    expect(text()).toContain('main');
    // Abbreviated the way git abbreviates, and deliberately not a link: nothing in this store
    // records a commit, a run or a project.
    expect(text()).toContain('9f96484');
    expect(page().querySelectorAll('tbody a')).toHaveLength(1);
  });

  it('draws an em dash where a version was published without metadata', async () => {
    await open('docs', '@userflows/qits-artifacts');
    http.expectOne(VERSIONS).flush({ versions: [version({ metadata: {} })] });
    await settle();

    expect(text()).toContain('—');
    expect(text()).not.toContain('undefined');
  });

  it('draws a never-served version as never, not as a date and not as zero', async () => {
    await open('docs', '@userflows/qits-artifacts');
    http.expectOne(VERSIONS).flush({ versions: [version()] });
    await settle();

    expect(text()).toContain('Never');
    expect(text()).toContain('28 Aug 2026 20:23:27Z');
  });

  it('totals nothing — versions of a site share their bytes', async () => {
    await open('docs', '@userflows/qits-artifacts');
    http.expectOne(VERSIONS).flush({ versions: [version(), version({ version: '2026.827.1' })] });
    await settle();

    expect(page().querySelector('tfoot')).toBeNull();
    expect(text()).toContain('Neither column is totalled');
  });

  it('says an empty list is empty rather than rendering blank space', async () => {
    await open('docs', 'nothing');
    http
      .expectOne('/artifacts/api/repositories/docs/docs/nothing/versions')
      .flush({ versions: [] });
    await settle();

    expect(text()).toContain('no published versions');
  });

  it('reports a failed read rather than an empty site', async () => {
    await open('docs', 'nothing');
    http
      .expectOne('/artifacts/api/repositories/docs/docs/nothing/versions')
      .flush({ message: 'no such repository' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(text()).toContain('Could not load the versions');
    expect(text()).toContain('404');
  });
});
