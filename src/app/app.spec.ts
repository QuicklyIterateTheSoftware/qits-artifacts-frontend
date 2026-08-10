import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import { App } from './app';
import { routes } from './app.routes';

/**
 * A fixture navigation, not the platform's. `provideQitsNavigationLinks` answers the layout's
 * `QITS_NAVIGATION` from a literal, so the chrome makes no `/main-navigation` request — which is
 * what keeps `http.verify()` below honest instead of failing on a call this file never asked for.
 */
const NAV = [
  { label: 'CI', href: '/ci/' },
  { label: 'Deployments', href: '/platform-deployments/' },
  { label: 'Artifacts', href: '/artifacts/' },
] as const;

/**
 * The shell owns one thing — the outlet — so that is what is asserted here, plus the route table
 * reaching the shared layout through it and the pages sitting inside that layout rather than
 * replacing it.
 *
 * What the layout renders is the ui-components library's business, not this repo's. The link count
 * checked against it used to be the platform's, on the reasoning that a nav which quietly loses a
 * destination is a regression nobody notices from inside a single app. It cannot be that any more:
 * the doors come from qits-gateway's `/main-navigation` now, so their number is a deployment fact
 * and watching it is the gateway's own spec's job. The count here is the fixture's, and what it
 * proves is that this app mounts the chrome and the chrome renders what it is told.
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
        provideQitsNavigationLinks(NAV),
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
    expect(layout.querySelectorAll('nav a')).toHaveLength(NAV.length);
    expect(layout.querySelector('main app-repositories-page')).not.toBeNull();

    // The overview's two reads, drained so the harness has no dangling requests.
    http.expectOne('/artifacts/api/repositories').flush({ repositories: [] });
    http.expectOne('/artifacts/api/store/summary').flush({
      ociPerImageSumBytes: 0,
      ociUnionBytes: 0,
      orphanBytes: 0,
      npmPublishedBytes: 0,
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
