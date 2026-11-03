import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import {
  provideQitsBuilds,
  provideQitsNavigation,
  provideQitsProjects,
  provideQitsScope,
} from '@qits/ui-components';
import { provideQitsBearerSignIn, qitsBearerInterceptor } from '@qits/angular';

import { routes } from './app.routes';

/**
 * Nine providers.
 *
 * - `provideBrowserGlobalErrorListeners` funnels genuinely-global errors and unhandled rejections
 *   into Angular's `ErrorHandler`.
 * - `provideRouter` carries the whole of this app's state — every level of the drill-down is a path
 *   segment — so it is what makes each page bookmarkable.
 * - `withFetch` is not a preference. The default XHR backend is invisible to OTLP fetch
 *   instrumentation, so choosing it would quietly forfeit client spans the moment this deployment
 *   grows a telemetry relay. Every call this app's own `ArtifactsApi` makes is a same-origin path
 *   behind the gateway, and these reads carry no credential at all — the artifacts token filter
 *   covers writes only, and this app makes none. `withInterceptors([qitsBearerInterceptor])` is
 *   still added, because the two downloads below need `QitsBearerFetch`, which the same sign-in
 *   provides (epic qits-543).
 * - `provideQitsBearerSignIn({ clientId: 'qits-spa' })` wires the OIDC authorization-code-with-PKCE
 *   sign-in, the token store, and `/auth/callback` — prepended to the routes below, ahead of every
 *   guard this app might add. The daemon page's version download and the repository page's blob
 *   download are role-guarded routes a plain `<a href>` cannot carry a bearer to, so both fetch
 *   through `QitsBearerFetch.download` instead (`daemon-page.ts`, `repository-page.ts`).
 * - `provideQitsNavigation` gives `QitsMainLayout` its left navigation, by asking the gateway for
 *   `/main-navigation` once at startup. The list is the gateway's answer now — derived from the
 *   routes it actually serves — not a list compiled into @qits/ui-components; without this provider
 *   the chrome renders no links at all. It needs the `provideHttpClient` above.
 * - `provideQitsProjects` puts the project picker in the chrome's top-left slot, where the wordmark
 *   was, from one `GET /projects/api/projects`. Every resource on this platform belongs to a
 *   project, so which one is open is the outermost fact about a page rather than a filter inside
 *   one of them — above the links, because it scopes them. It also installs the repositories of
 *   whatever project is in scope, which the sidebar draws under each group.
 * - `provideQitsScope('repository')` says how deep this application's own addresses go. Everything
 *   stored here is published by one repository, so every page is addressable under
 *   `/<slug>/<group>/<repo>/` as well as at its own path, and the pages read the scope rather
 *   than those route params.
 * - `provideQitsBuilds` puts the pending-builds bolt beside that picker: a popover of what qits-ci
 *   is building right now, from `GET /ci/api/runs/active`. Same-origin like every other read here —
 *   the edge routes `/ci` on every host — so it needs the `provideHttpClient` above and names no
 *   origin of its own. Providing it is what puts the bolt there, exactly as no project source means
 *   no picker. Closed, it asks nothing at all; it polls only while a reader keeps the panel open.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([qitsBearerInterceptor])),
    provideQitsBearerSignIn({ clientId: 'qits-spa' }),
    provideQitsNavigation(),
    provideQitsProjects(),
    provideQitsScope('repository'),
    provideQitsBuilds(),
  ],
};
