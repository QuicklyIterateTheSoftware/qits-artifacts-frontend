import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { MirrorUpstreamDto } from '../api/dto';
import { QITS_REGISTRY_HOST } from '../api/registry-host';
import { routes } from '../app.routes';

/**
 * The upstream map, one state at a time.
 *
 * Three assertions here are about honesty rather than rendering, and they are the ones worth
 * keeping if the rest are ever trimmed: the page costs **one** request to open and none per row; a
 * write costs one request and no re-read, because the service answers with the row it wrote; and
 * the remove confirmation says in so many words that **nothing cached is deleted** — the one claim
 * this page could make that would be genuinely dangerous if it were wrong.
 */
describe('MirrorsPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  const upstream = (over: Partial<MirrorUpstreamDto> = {}): MirrorUpstreamDto => ({
    domain: 'quay.io',
    slug: 'quay',
    createdAt: '2026-08-01T13:50:45Z',
    cachedImages: 1,
    ...over,
  });

  const registered = [
    upstream({ domain: 'docker.io', slug: 'hub', cachedImages: 1 }),
    upstream(),
    upstream({ domain: 'registry.access.redhat.com', slug: 'redhat', cachedImages: 0 }),
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // jsdom's host is an artefact of the runner; this is the platform's own registry address.
        { provide: QITS_REGISTRY_HOST, useValue: 'localhost:8081' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function open(): Promise<void> {
    harness = await RouterTestingHarness.create('/mirrors');
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

  function flushUpstreams(rows: readonly MirrorUpstreamDto[] = registered): void {
    http.expectOne('/artifacts/api/mirror-upstreams').flush({ upstreams: rows });
  }

  function press(label: string): void {
    const button = Array.from(page().querySelectorAll('button')).find((candidate) =>
      (candidate.textContent ?? '').includes(label),
    );
    button?.click();
  }

  function type(id: string, value: string): void {
    const input = page().querySelector<HTMLInputElement>(`#${id}`);
    if (!input) {
      throw new Error(`no input #${id}`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('reads exactly one request, and none per upstream', async () => {
    await open();
    flushUpstreams();
    await settle();

    http.verify();
    expect(text()).toContain('3 upstreams');
  });

  it('prints the pull prefix a reader can paste, built from the host they reached', async () => {
    await open();
    flushUpstreams();
    await settle();

    expect(text()).toContain('localhost:8081/quay/');
    expect(text()).toContain('localhost:8081/redhat/');
    expect(text()).toContain('registry.access.redhat.com');
  });

  it('says a namespace that has cached nothing has cached nothing', async () => {
    await open();
    flushUpstreams();
    await settle();

    expect(text()).toContain('0 images');
    expect(text()).toContain('1 image');
  });

  it('refuses a bad domain or namespace without spending a request', async () => {
    await open();
    flushUpstreams();
    await settle();

    press('Register an upstream…');
    await settle();

    type('upstream-domain', 'localhost');
    type('upstream-slug', 'Ghcr');
    await settle();

    expect(text()).toContain('Not a registry domain');
    expect(text()).toContain('Not a usable namespace');

    press('Register');
    await settle();
    http.verify(); // nothing was sent
  });

  it('names a namespace clash from the list it already has', async () => {
    await open();
    flushUpstreams();
    await settle();

    press('Register an upstream…');
    await settle();
    type('upstream-domain', 'ghcr.io');
    type('upstream-slug', 'quay');
    await settle();

    expect(text()).toContain('already mirrors quay.io');

    press('Register');
    await settle();
    http.verify();
  });

  it('registers an upstream in one request and splices the answer in, with no re-read', async () => {
    await open();
    flushUpstreams();
    await settle();

    press('Register an upstream…');
    await settle();
    type('upstream-domain', ' GHCR.io ');
    type('upstream-slug', 'ghcr');
    await settle();

    // The normalisation is shown before it is sent.
    expect(text()).toContain('localhost:8081/ghcr/');

    press('Register');
    await settle();

    const request = http.expectOne('/artifacts/api/mirror-upstreams/ghcr.io');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ slug: 'ghcr' });
    // No credential: this application has never sent one, and the guard is the service's.
    expect(request.request.headers.has('X-Artifacts-Token')).toBe(false);
    request.flush({
      upstream: upstream({ domain: 'ghcr.io', slug: 'ghcr', cachedImages: 0 }),
    });
    await settle();

    expect(text()).toContain('ghcr.io');
    expect(text()).toContain('4 upstreams');
    http.verify(); // the write answered with the row, so nothing was re-read
  });

  it('warns that the cached bytes stay, and only then removes the upstream', async () => {
    await open();
    flushUpstreams();
    await settle();

    press('Remove');
    await settle();

    expect(text()).toContain('Nothing cached is deleted.');
    expect(text()).toContain('keep serving');
    http.verify(); // asking is free

    press('Stop mirroring docker.io');
    await settle();

    const request = http.expectOne('/artifacts/api/mirror-upstreams/docker.io');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(text()).toContain('2 upstreams');
    expect(text()).not.toContain('docker.io');
    http.verify();
  });

  it('names the token and the caller that holds it when a write is guarded', async () => {
    await open();
    flushUpstreams();
    await settle();

    press('Remove');
    await settle();
    press('Stop mirroring docker.io');
    await settle();

    http
      .expectOne('/artifacts/api/mirror-upstreams/docker.io')
      .flush(
        { message: 'Missing or invalid X-Artifacts-Token' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle();

    expect(text()).toContain('X-Artifacts-Token');
    expect(text()).toContain('from a shell');
    expect(text()).toContain('docker.io'); // the row is still there, because nothing was removed
  });

  it('repeats the service’s own sentence when the service refuses a registration', async () => {
    await open();
    flushUpstreams();
    await settle();

    press('Register an upstream…');
    await settle();
    type('upstream-domain', 'ghcr.io');
    type('upstream-slug', 'npm');
    await settle();

    press('Register');
    await settle();
    http.expectOne('/artifacts/api/mirror-upstreams/ghcr.io').flush(
      {
        message:
          "'npm' is already a npm-packages repository; a mirror namespace cannot share a name with one",
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(text()).toContain('already a npm-packages repository');
  });

  it('says out loud that an empty map means every mirror pull 404s', async () => {
    await open();
    flushUpstreams([]);
    await settle();

    expect(text()).toContain('No upstream is registered');
  });

  it('reports a failed read rather than drawing an empty map', async () => {
    await open();
    http
      .expectOne('/artifacts/api/mirror-upstreams')
      .flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    await settle();

    expect(text()).toContain('Could not load the upstreams');
    expect(text()).not.toContain('No upstream is registered');
  });
});
