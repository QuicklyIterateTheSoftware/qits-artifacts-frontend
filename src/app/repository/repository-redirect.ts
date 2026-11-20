import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, type ParamMap } from '@angular/router';
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
 * The landing app's own path for whatever this route's matched params carry: `repo` alone for
 * `repositories/:repo`, `repo` and `image` together for `repositories/:repo/images/:image`, or
 * `repo` and `coordinate` together for `repositories/:repo/maven-packages/:coordinate`. All three
 * mounts share the one `RepositoryRedirect` below, so the params on the matched route are exactly
 * the params this builds from — there is never a fourth shape to account for.
 */
function landingPath(params: ParamMap): string {
  const repo = encodeURIComponent(params.get('repo') ?? '');
  const image = params.get('image');
  if (image !== null) return `/artifacts/repositories/${repo}/images/${encodeURIComponent(image)}`;
  const coordinate = params.get('coordinate');
  if (coordinate !== null) {
    return `/artifacts/repositories/${repo}/maven-packages/${encodeURIComponent(coordinate)}`;
  }
  return `/artifacts/repositories/${repo}`;
}

/**
 * `repositories/:repo`, `repositories/:repo/images/:image` and
 * `repositories/:repo/maven-packages/:coordinate` — each one entry inside `OWN`, mounted three
 * times (bare, under a project, under `:project/:group/:repository`), none of them drawing
 * `RepositoryPage`, `ImagePage` or `MavenPage` here any more (qits-2316, qits-2324, qits-2325).
 *
 * It draws almost nothing of its own: a line for the moment between mounting and the hand-off.
 * `/repositories/<repo>`, `/repositories/<repo>/images/<image>` and
 * `/repositories/<repo>/maven-packages/<coordinate>` used to open this application's own pages for
 * that repository, that image or that coordinate; this component instead performs a full-document
 * hand-off to the landing app's own address for whichever one matched —
 * `<landing origin>/artifacts/repositories/<repo>`,
 * `<landing origin>/artifacts/repositories/<repo>/images/<image>` or
 * `<landing origin>/artifacts/repositories/<repo>/maven-packages/<coordinate>` — through
 * {@link NAVIGATE_AWAY} rather than the router: the destination is a different Angular
 * application, and a `routerLink` would compile and go nowhere.
 *
 * The params are read off **this route's own** `ActivatedRoute`, not a parent's and not
 * `QITS_SCOPE`: all three spellings of each mount share one route object (the matching `OWN`
 * entry, mounted three times), so whatever that route itself captures is already the right value
 * in every spelling, with no scope resolution needed to find it.
 */
@Component({
  selector: 'app-repository-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Opening this {{ noun }} in the landing app…</p>`,
})
export class RepositoryRedirect {
  private readonly route = inject(ActivatedRoute);

  /** Which noun the message above names, decided once off this route's own matched params. */
  protected readonly noun = this.route.snapshot.paramMap.has('image')
    ? 'image'
    : this.route.snapshot.paramMap.has('coordinate')
      ? 'coordinate'
      : 'repository';

  constructor() {
    const path = landingPath(this.route.snapshot.paramMap);
    const links = inject(QitsAppLinks);
    const navigateAway = inject(NAVIGATE_AWAY);
    void landingOrigin(links).then((origin) => {
      navigateAway(`${origin.replace(/\/+$/, '')}${path}`);
    });
  }
}
