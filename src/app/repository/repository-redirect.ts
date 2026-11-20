import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, type Data, type ParamMap } from '@angular/router';
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
 * The landing app's own path for whatever this route's matched params and data carry: `repo`
 * alone for `repositories/:repo`, `repo` and `image` together for
 * `repositories/:repo/images/:image`, `repo` and `daemon` together for
 * `repositories/:repo/daemons/:daemon`, `repo` and `site` together for
 * `repositories/:repo/docs/:site`, or `repo` alone again — but marked by `data.landing` — for
 * `repositories/:repo/cleanup`. All five mounts share the one `RepositoryRedirect` below, so the
 * params and data on the matched route are exactly what this builds from — there is never a sixth
 * shape to account for, and no route carries more than one of `image`/`daemon`/`site` at once, nor
 * both one of those params and `data.landing` together.
 *
 * `image`, `daemon` and `site` are read first because none can be mistaken for another shape: a
 * route that carries one is `images/:image`, `daemons/:daemon` or `docs/:site` and nothing else.
 * `repo` alone is ambiguous between `repositories/:repo` and `repositories/:repo/cleanup` — both
 * match only on `repo` — which is why the latter is told apart by its route `data` rather than by
 * a param.
 */
function landingPath(params: ParamMap, data: Data): string {
  const repo = encodeURIComponent(params.get('repo') ?? '');
  const image = params.get('image');
  const daemon = params.get('daemon');
  const site = params.get('site');
  if (image !== null) {
    return `/artifacts/repositories/${repo}/images/${encodeURIComponent(image)}`;
  }
  if (daemon !== null) {
    return `/artifacts/repositories/${repo}/daemons/${encodeURIComponent(daemon)}`;
  }
  if (site !== null) {
    return `/artifacts/repositories/${repo}/docs/${encodeURIComponent(site)}`;
  }
  return data['landing'] === 'cleanup'
    ? `/artifacts/repositories/${repo}/cleanup`
    : `/artifacts/repositories/${repo}`;
}

/**
 * `repositories/:repo`, `repositories/:repo/images/:image`, `repositories/:repo/daemons/:daemon`,
 * `repositories/:repo/docs/:site` and `repositories/:repo/cleanup` — each one entry inside `OWN`,
 * mounted three times (bare, under a project, under `:project/:group/:repository`), none of them
 * drawing `RepositoryPage`, `ImagePage`, `DaemonPage`, `DocsPage` or `CleanupPage` here any more
 * (qits-2316, qits-2324, qits-2327, qits-2328, qits-2329).
 *
 * It draws almost nothing of its own: a line for the moment between mounting and the hand-off.
 * `/repositories/<repo>`, `/repositories/<repo>/images/<image>`,
 * `/repositories/<repo>/daemons/<daemon>`, `/repositories/<repo>/docs/<site>` and
 * `/repositories/<repo>/cleanup` used to open this application's own pages for that repository,
 * that image, that daemon, that site or that cleanup; this component instead performs a
 * full-document hand-off to the landing app's own address for
 * whichever one matched — `<landing origin>/artifacts/repositories/<repo>`,
 * `<landing origin>/artifacts/repositories/<repo>/images/<image>`,
 * `<landing origin>/artifacts/repositories/<repo>/daemons/<daemon>`,
 * `<landing origin>/artifacts/repositories/<repo>/docs/<site>` or
 * `<landing origin>/artifacts/repositories/<repo>/cleanup` — through {@link NAVIGATE_AWAY} rather
 * than the router: the destination is a different Angular application, and a `routerLink` would
 * compile and go nowhere.
 *
 * The params and the data are read off **this route's own** `ActivatedRoute`, not a parent's and
 * not `QITS_SCOPE`: all three spellings of each mount share one route object (the matching `OWN`
 * entry, mounted three times), so whatever that route itself captures or carries is already the
 * right value in every spelling, with no scope resolution needed to find it.
 */
@Component({
  selector: 'app-repository-redirect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Opening this {{ noun }} in the landing app…</p>`,
})
export class RepositoryRedirect {
  private readonly route = inject(ActivatedRoute);

  /** Which noun the message above names, decided once off this route's own matched params/data. */
  protected readonly noun = this.route.snapshot.paramMap.has('image')
    ? 'image'
    : this.route.snapshot.paramMap.has('daemon')
      ? 'daemon'
      : this.route.snapshot.paramMap.has('site')
        ? 'site'
        : this.route.snapshot.data['landing'] === 'cleanup'
          ? 'cleanup'
          : 'repository';

  constructor() {
    const path = landingPath(this.route.snapshot.paramMap, this.route.snapshot.data);
    const links = inject(QitsAppLinks);
    const navigateAway = inject(NAVIGATE_AWAY);
    void landingOrigin(links).then((origin) => {
      navigateAway(`${origin.replace(/\/+$/, '')}${path}`);
    });
  }
}
