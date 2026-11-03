import { HttpBackend, HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { QITS_SIGN_IN } from '@qits/angular';
import { appConfig } from './app.config';

/**
 * The backend choice is invisible when it is wrong: the XHR one works perfectly and simply produces
 * client spans that never exist. So it is asserted here rather than discovered as a telemetry gap,
 * the same way spa-home, spa-ci and spa-cd assert their own wiring.
 */
describe('appConfig', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
  });

  it('provides an HttpClient on the fetch backend', () => {
    expect(TestBed.inject(HttpClient)).toBeTruthy();
    expect(TestBed.inject(HttpBackend).constructor.name).toContain('Fetch');
  });

  /**
   * Cheap check that the bearer sign-in is actually wired, rather than merely imported: the
   * `qits-spa` client id resolves, and the environment initializer has prepended `auth/callback`
   * ahead of this app's own routes (epic qits-543) — `withInterceptors([qitsBearerInterceptor])`
   * itself is asserted once, in the library, not re-asserted per consumer.
   */
  it('wires the qits-spa bearer sign-in ahead of this app’s routes', () => {
    expect(TestBed.inject(QITS_SIGN_IN).clientId).toBe('qits-spa');
    expect(TestBed.inject(Router).config[0]?.path).toBe('auth/callback');
  });
});
