import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideQitsNavigation, provideQitsProjects, provideQitsScope } from '@qits/ui-components';

import { routes } from './app.routes';

/**
 * Five providers, in the order spa-home documents and spa-ci and spa-cd repeat.
 *
 * - `provideBrowserGlobalErrorListeners` funnels genuinely-global errors and unhandled rejections
 *   into Angular's `ErrorHandler`.
 * - `provideRouter` carries the whole of this app's state — every level of the drill-down is a path
 *   segment — so it is what makes each page bookmarkable.
 * - `withFetch` is not a preference. The default XHR backend is invisible to OTLP fetch
 *   instrumentation, so choosing it would quietly forfeit client spans the moment this deployment
 *   grows a telemetry relay. Every call this app makes is a same-origin path behind the gateway,
 *   and these reads carry no credential at all — the artifacts token filter covers writes only.
 * - `provideQitsNavigation` gives `QitsMainLayout` its left navigation, by asking the gateway for
 *   `/main-navigation` once at startup. The list is the gateway's answer now — derived from the
 *   routes it actually serves — not a list compiled into @qits/ui-components; without this provider
 *   the chrome renders no links at all. It needs the `provideHttpClient` above.
 * - `provideQitsProjects` puts the project picker in the chrome's top-left slot, where the wordmark
 *   was, from one `GET /projects/api/projects`. Every resource on this platform belongs to a
 *   project, so which one is open is the outermost fact about a page rather than a filter inside
 *   one of them — above the links, because it scopes them. It also installs the repositories of
 *   whatever project is in scope, which the sidebar draws under each category.
 * - `provideQitsScope('repository')` says how deep this application's own addresses go. Everything
 *   stored here is published by one repository, so every page is addressable under
 *   `/<slug>/<category>/<repo>/` as well as at its own path, and the pages read the scope rather
 *   than those route params.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideQitsNavigation(),
    provideQitsProjects(),
    provideQitsScope('repository'),
  ],
};
