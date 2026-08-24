import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationTree } from '@qits/ui-components';
import { routes } from '../app.routes';
import type { OciTagDto } from '../api/dto';

const FULL_SHA = '9f96484aa1c0d1e2f3a4b5c6d7e8f90123456789';
const SHORT_SHA = '9f96484';

/**
 * The tags of one image, and the one link this platform can honestly draw between an artifact and
 * a build.
 *
 * The link assertions are the point of this file. A tag that looks like a commit gets a link, a tag
 * that does not gets none, and the link goes to the CI explorer's **repository** view — never to a
 * run URL, which nothing in either store could tell us. Which address that is, is
 * `ArtifactsLinks`' answer and `links.spec.ts`' subject; here it only has to be there.
 */
describe('ImagePage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  const tag = (name: string, over: Partial<OciTagDto> = {}): OciTagDto => ({
    tag: name,
    digest: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    sizeBytes: 512180224,
    createdAt: '2026-07-31T14:06:23Z',
    accessedAt: null,
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // The CI link is an origin the PLATFORM states, not a path compiled in — so a spec that
        // provided no navigation would assert against a link this app cannot honestly draw. There
        // is no fallback behind this any more: an edge naming qits-ci nowhere draws no link.
        provideQitsNavigationTree({
          origin: 'https://dev.example.com',
          slots: {
            'services.details': [
              {
                app: 'qits-ci',
                label: 'CI',
                host: 'ci',
                origin: 'https://ci.dev.example.com',
                path: '/ci',
              },
            ],
          },
        }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function open(image = 'qits-ci'): Promise<void> {
    harness = await RouterTestingHarness.create(`/repositories/qits/images/${image}`);
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

  function flushImage(over: Record<string, number> = {}): void {
    http.expectOne('/artifacts/api/repositories/qits/images').flush({
      images: [{ name: 'qits-ci', tagCount: 2, manifestCount: 2, sizeBytes: 536870912, ...over }],
    });
  }

  function flushTags(tags: readonly OciTagDto[]): void {
    http.expectOne('/artifacts/api/repositories/qits/images/qits-ci/tags').flush({ tags });
    http.expectOne('/artifacts/api/repositories/qits/images/qits-ci/manifests').flush({
      manifests: tags.map((row) => ({
        digest: row.digest,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
        accessedAt: row.accessedAt,
        tags: [row.tag],
      })),
    });
  }

  it('reads exactly three requests, and none per row', async () => {
    await open();
    flushImage();
    flushTags([tag(FULL_SHA), tag('latest')]);
    await settle();

    http.verify();
    expect(text()).toContain('2 tags · 2 manifests');
  });

  it('shows a real last access and distinguishes a never-read tag', async () => {
    await open();
    flushImage();
    flushTags([
      tag('used', { accessedAt: '2026-08-01T09:10:11Z' }),
      tag('unused', { accessedAt: null }),
    ]);
    await settle();

    expect(text()).toContain('Last accessed');
    expect(text()).toContain('1 Aug 2026 09:10:11Z');
    expect(text()).toContain('Never');
  });

  it('shows untagged manifests in the cleanup inventory', async () => {
    await open();
    flushImage();
    http.expectOne('/artifacts/api/repositories/qits/images/qits-ci/tags').flush({ tags: [] });
    http.expectOne('/artifacts/api/repositories/qits/images/qits-ci/manifests').flush({
      manifests: [
        {
          digest: 'sha256:untagged0123456789',
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          sizeBytes: 1024,
          createdAt: '2026-07-31T14:06:23Z',
          accessedAt: null,
          tags: [],
        },
      ],
    });
    await settle();

    expect(text()).toContain('Cleanup inventory');
    expect(text()).toContain('Untagged');
  });

  it('reports a failed cleanup inventory independently of the tag table', async () => {
    await open();
    flushImage();
    http.expectOne('/artifacts/api/repositories/qits/images/qits-ci/tags').flush({ tags: [] });
    http
      .expectOne('/artifacts/api/repositories/qits/images/qits-ci/manifests')
      .flush({ message: 'down' }, { status: 503, statusText: 'Unavailable' });
    await settle();

    expect(text()).toContain('Could not load the manifests');
    expect(text()).toContain('503');
  });

  it('submits UTC and never-accessed filters to both artifact listings', async () => {
    await open();
    flushImage();
    flushTags([]);
    await settle();

    const created = page().querySelector<HTMLInputElement>('input[name="createdAfter"]')!;
    created.value = '2026-07-01T12:30';
    created.dispatchEvent(new Event('input'));
    const access = page().querySelector<HTMLSelectElement>('select[name="accessState"]')!;
    access.value = 'never';
    access.dispatchEvent(new Event('change'));
    page().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle();

    for (const suffix of ['tags', 'manifests']) {
      const request = http.expectOne((candidate) => candidate.url.endsWith(`/${suffix}`));
      expect(request.request.params.get('created-after')).toBe('2026-07-01T12:30:00Z');
      expect(request.request.params.get('never-accessed')).toBe('true');
      request.flush(suffix === 'tags' ? { tags: [] } : { manifests: [] });
    }
  });

  it('leads with the per-image union and labels it as one', async () => {
    await open();
    flushImage();
    flushTags([tag(FULL_SHA)]);
    await settle();

    expect(text()).toContain('512 MiB');
    expect(text()).toContain("union over this image's blobs");
  });

  it('says the per-tag column is not additive, twice, because it is the 2.63× error', async () => {
    await open();
    flushImage();
    flushTags([tag(FULL_SHA), tag(SHORT_SHA)]);
    await settle();

    expect(text()).toContain('Referenced bytes (not additive)');
    expect(text()).toContain('These do not add up');
  });

  it('links a full 40-hex tag to the CI explorer at this image’s repository', async () => {
    await open();
    flushImage();
    flushTags([tag(FULL_SHA)]);
    await settle();

    const link = page().querySelector<HTMLAnchorElement>('tbody a');
    expect(link?.getAttribute('href')).toBe('https://ci.dev.example.com/?repo=qits-ci');
    expect(link?.textContent?.trim()).toBe(FULL_SHA);
    expect(link?.getAttribute('aria-label')).toContain('look for commit 9f96484');
  });

  it('links the abbreviated form too, because this platform carries both', async () => {
    await open();
    flushImage();
    flushTags([tag(SHORT_SHA)]);
    await settle();

    expect(page().querySelector('tbody a')).not.toBeNull();
  });

  it('leaves a tag that is not a commit unlinked, rather than guessing', async () => {
    await open();
    flushImage();
    flushTags([tag('latest'), tag('0.0.4')]);
    await settle();

    expect(page().querySelectorAll('tbody a')).toHaveLength(0);
  });

  it('says the link is an offer to go looking, not a link to a run', async () => {
    await open();
    flushImage();
    flushTags([tag(FULL_SHA)]);
    await settle();

    expect(text()).toContain('is not a link to a specific run');
    expect(text()).toContain('Nothing in this store records a commit, a run or a project');
  });

  it('shortens digests until asked, and asking costs no request', async () => {
    await open();
    flushImage();
    flushTags([tag(FULL_SHA)]);
    await settle();

    expect(text()).toContain('sha256:0123456789ab');
    expect(text()).not.toContain('sha256:0123456789abcdef');

    const toggle = Array.from(page().querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('digests'),
    );
    toggle?.click();
    await settle();

    http.verify();
    expect(text()).toContain('sha256:0123456789abcdef');
  });

  it('reports the manifests no tag points at, whose bytes are still in the union', async () => {
    await open();
    flushImage({ tagCount: 87, manifestCount: 155 });
    http
      .expectOne('/artifacts/api/repositories/qits/images/qits-ci/tags')
      .flush({ tags: [tag(FULL_SHA)] });
    http.expectOne('/artifacts/api/repositories/qits/images/qits-ci/manifests').flush({
      manifests: Array.from({ length: 68 }, (_, index) => ({
        digest: `sha256:untagged${index}`,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        sizeBytes: 1,
        createdAt: '2026-07-31T14:06:23Z',
        accessedAt: null,
        tags: [],
      })),
    });
    await settle();

    expect(text()).toContain('68 manifests that no tag points at');
  });

  it('keeps the page standing when only the image listing fails', async () => {
    await open();
    http
      .expectOne('/artifacts/api/repositories/qits/images')
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    flushTags([tag(FULL_SHA)]);
    await settle();

    expect(text()).toContain('the image listing has not answered');
    expect(text()).toContain(FULL_SHA);
  });

  it('says an empty tag list is not proof the image exists', async () => {
    await open();
    flushImage();
    flushTags([]);
    await settle();

    expect(text()).toContain('an image that does not exist answers the same way');
  });
});
