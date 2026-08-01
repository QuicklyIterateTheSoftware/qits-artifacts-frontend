import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';

/**
 * The shell owns one thing — the outlet — so that is what is asserted here, plus the route table
 * reaching the shared layout through it and the pages sitting inside that layout rather than
 * replacing it.
 *
 * What the layout renders is the ui-components library's business, not this repo's. The one number
 * checked against it is the link count, because a nav that quietly loses a destination is the kind
 * of regression nobody notices from inside a single app.
 */
describe('App', () => {
  let http: HttpTestingController;

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

  it('is an outlet and nothing else', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('router-outlet')).not.toBeNull();
    expect(shell.children).toHaveLength(1);
  });

  it('routes the base path to the shared layout, with the overview inside it', async () => {
    const harness = await RouterTestingHarness.create('/');
    const layout = harness.routeNativeElement as HTMLElement;

    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelectorAll('nav a')).toHaveLength(8);
    expect(layout.querySelector('main app-repositories-page')).not.toBeNull();

    // The overview's two reads, drained so the harness has no dangling requests.
    http.expectOne('/artifacts/api/repositories').flush({ repositories: [] });
    http.expectOne('/artifacts/api/store/summary').flush({
      ociPerImageSumBytes: 0,
      ociUnionBytes: 0,
      orphanBytes: 0,
      npmPublishedBytes: 0,
      npmProxyTarballBytes: 0,
      npmProxyPackumentBytes: 0,
      diskTotalBytes: 0,
    });
  });

  it('draws an unknown URL under /artifacts/ as a page, still inside the chrome', async () => {
    const harness = await RouterTestingHarness.create('/nothing-here');
    const layout = harness.routeNativeElement as HTMLElement;

    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelector('main app-not-found')).not.toBeNull();
    http.verify();
  });
});
