import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';

/**
 * The shell owns one thing — the outlet — so that is what is asserted here, plus the route table
 * actually reaching the shared layout through it. What the layout renders is the ui-components
 * library's business, not this repo's; all that matters here is that `''` arrives at it.
 */
describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideLocationMocks()],
    });
  });

  it('is an outlet and nothing else', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('router-outlet')).not.toBeNull();
    expect(shell.children).toHaveLength(1);
  });

  it('routes the base path to the shared layout', async () => {
    const harness = await RouterTestingHarness.create('/');
    const layout = harness.routeNativeElement as HTMLElement;

    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelectorAll('nav a')).toHaveLength(8);
    expect(layout.querySelector('main router-outlet')).not.toBeNull();
  });
});
