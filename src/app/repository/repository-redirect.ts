import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QitsAppLinks } from '@qits/ui-components';
import { NAVIGATE_AWAY } from '../ui/navigate-away';

/**
 * How long this page waits for the navigation to name `qits-landing`'s origin before giving up on
 * it and using whatever `QitsAppLinks.environmentOrigin` already answers.
 *
 * A work ref drawn by an already-mounted chrome never needs a bound: the navigation has already
 * been asked the question by the time anyone clicks it. This page has no such luxury — `repo`'s
 * own path is reached in all three spellings `repositories/:repo` resolves to, including the bare
 * one, which can be the very first thing a browser requests with no chrome mounted yet to have
 * asked first — so it waits itself, briefly, rather than firing at an origin it has not actually
 * been told yet.
 */
export const LANDING_ORIGIN_WAIT_MS = 1500;

/**
 * Where `qits-landing` answers, on the same terms a work ref reads it: `QitsAppLinks.origin`
 * first, `environmentOrigin` second — which on this platform *is* the apex landing serves from —
 * same origin (the bare path, used as it is) third.
 *
 * `whenApiOrigin('qits-landing')` settles the moment the navigation does, which on a warm platform
 * (one that already answered, or a literal tree in a spec) is a single microtask. Past
 * {@link LANDING_ORIGIN_WAIT_MS} the wait is abandoned and `environmentOrigin` is read as it stands
 * right now instead, so a reader is never left on this blank page by a navigation that is merely
 * slow — or that never answers at all.
 */
async function landingOrigin(links: QitsAppLinks): Promise<string> {
  const settled = links
    .whenApiOrigin('qits-landing')
    .then(() => links.origin('qits-landing') ?? links.environmentOrigin() ?? '');
  const bound = new Promise<string>((resolve) => {
    setTimeout(() => resolve(links.environmentOrigin() ?? ''), LANDING_ORIGIN_WAIT_MS);
  });
  return Promise.race([settled, bound]);
}

/**
 * `repositories/:repo` — all three spellings `OWN` mounts it under (bare, under a project, under
 * `:project/:group/:repository`), none of them drawing `RepositoryPage` here any more.
 *
 * It draws almost nothing of its own: a line for the moment between mounting and the hand-off.
 * `/repositories/<repo>` used to open this application's own page for that repository; this
 * component instead performs a full-document hand-off to the landing app's own address for it,
 * `<landing origin>/artifacts/repositories/<repo>`, through {@link NAVIGATE_AWAY} rather than the
 * router: the destination is a different Angular application, and a `routerLink` would compile and
 * go nowhere.
 *
 * The `repo` param is read off **this route's own** `ActivatedRoute`, not a parent's and not
 * `QITS_SCOPE`: all three spellings share this one route object (`OWN`'s `repositories/:repo`
 * entry, mounted three times), so the param that route itself captures is already the right one in
 * every spelling, with no scope resolution needed to find it.
 */
@Component({
  selector: 'app-repository-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Opening this repository in the landing app…</p>`,
})
export class RepositoryRedirect {
  constructor() {
    const repo = inject(ActivatedRoute).snapshot.paramMap.get('repo') ?? '';
    const links = inject(QitsAppLinks);
    const navigateAway = inject(NAVIGATE_AWAY);
    void landingOrigin(links).then((origin) => {
      navigateAway(`${origin.replace(/\/+$/, '')}/artifacts/repositories/${encodeURIComponent(repo)}`);
    });
  }
}
