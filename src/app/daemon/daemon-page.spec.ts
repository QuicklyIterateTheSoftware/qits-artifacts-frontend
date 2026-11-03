import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QitsBearerFetch } from '@qits/angular';
import { routes } from '../app.routes';
import type { DaemonVersionDto } from '../api/dto';

/** A stand-in for {@link QitsBearerFetch}: records what it was asked to download. */
class FakeBearerFetch {
  readonly downloads: { url: string; fileName: string }[] = [];
  async download(url: string, fileName: string): Promise<void> {
    this.downloads.push({ url, fileName });
  }
}

/**
 * The versions of one daemon.
 *
 * Two behaviours are worth the file on their own: a version cell that **fetches its own download
 * with the bearer** rather than a `routerLink` that would go nowhere or a plain `<a href>` that the
 * role-guarded route would answer 401 to, and a digest kept in the wire's own `sha256:<hex>`
 * spelling — shortened for the cell, whole in the title — because an operator copying it out is
 * pinning a deployment with it.
 */
describe('DaemonPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let bearerFetch: FakeBearerFetch;

  const version = (over: Partial<DaemonVersionDto> = {}): DaemonVersionDto => ({
    version: '2026.828.202327',
    digest: 'sha256:0123456789abcdef0123',
    sizeBytes: 20971520,
    publishedAt: '2026-08-28T20:23:27Z',
    accessedAt: null,
    ...over,
  });

  beforeEach(() => {
    bearerFetch = new FakeBearerFetch();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QitsBearerFetch, useValue: bearerFetch },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function open(repo: string, daemon: string): Promise<void> {
    harness = await RouterTestingHarness.create(`/repositories/${repo}/daemons/${daemon}`);
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

  it('reads exactly one request, and none per version', async () => {
    await open('daemons', 'qits-agent');
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/qits-agent/versions')
      .flush({ versions: [version(), version({ version: '2026.827.101010' })] });
    await settle();

    // 1 + 0. The type read the package page makes buys a column there and nothing here.
    http.verify();
    expect(text()).toContain('2 versions');
    expect(text()).toContain('20.0 MiB');
  });

  it('downloads a version with the bearer, not a plain link the guarded route would 401', async () => {
    await open('daemons', 'qits-agent');
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/qits-agent/versions')
      .flush({ versions: [version()] });
    await settle();

    const button = page().querySelector<HTMLButtonElement>('tbody button')!;
    button.click();
    await settle();

    // The daemon wire carries no repository segment — that is DaemonPaths' one departure from the
    // npm and maven grammars, and a download that invented one would 404.
    expect(bearerFetch.downloads).toEqual([
      { url: '/artifacts/daemons/qits-agent/2026.828.202327', fileName: 'qits-agent-2026.828.202327' },
    ]);
  });

  it('keeps the digest in the wire spelling, shortened for the cell and whole in the title', async () => {
    await open('daemons', 'qits-agent');
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/qits-agent/versions')
      .flush({ versions: [version()] });
    await settle();

    expect(text()).toContain('sha256:0123456789ab');
    const cell = page().querySelector<HTMLElement>('tbody td[title]')!;
    expect(cell.getAttribute('title')).toBe('sha256:0123456789abcdef0123');
  });

  it('draws a never-downloaded version as never, not as a date and not as zero', async () => {
    await open('daemons', 'qits-agent');
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/qits-agent/versions')
      .flush({ versions: [version()] });
    await settle();

    expect(text()).toContain('Never');
    expect(text()).toContain('28 Aug 2026 20:23:27Z');
  });

  it('says an accessed version was accessed, with the instant', async () => {
    await open('daemons', 'qits-agent');
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/qits-agent/versions')
      .flush({ versions: [version({ accessedAt: '2026-08-29T06:00:00Z' })] });
    await settle();

    expect(text()).toContain('29 Aug 2026 06:00:00Z');
  });

  it('totals nothing — the union above it is the smaller, different figure', async () => {
    await open('daemons', 'qits-agent');
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/qits-agent/versions')
      .flush({ versions: [version(), version({ version: '2026.827.101010' })] });
    await settle();

    expect(page().querySelector('tfoot')).toBeNull();
    expect(text()).toContain('not totalled');
  });

  it('says an empty list is empty rather than rendering blank space', async () => {
    await open('daemons', 'nothing');
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/nothing/versions')
      .flush({ versions: [] });
    await settle();

    expect(text()).toContain('no published versions');
  });

  it('reports a failed read rather than an empty daemon', async () => {
    await open('daemons', 'qits-agent');
    http
      .expectOne('/artifacts/api/repositories/daemons/daemons/qits-agent/versions')
      .flush({ message: 'no such repository' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(text()).toContain('Could not load the versions');
    expect(text()).toContain('404');
  });
});
