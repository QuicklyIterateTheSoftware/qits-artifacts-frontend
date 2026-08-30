import type { CanMatchFn, Routes, UrlSegment } from '@angular/router';
import { QitsMainLayout, QITS_CATEGORIES, type QitsCategory } from '@qits/ui-components';
import { CleanupPage } from './cleanup/cleanup-page';
import { DaemonPage } from './daemon/daemon-page';
import { DocsPage } from './docs/docs-page';
import { ImagePage } from './image/image-page';
import { NotFound } from './not-found/not-found';
import { PackagePage } from './package/package-page';
import { MavenPage } from './maven/maven-page';
import { RepositoriesPage } from './repositories/repositories-page';
import { RepositoryPage } from './repository/repository-page';

/**
 * Eight pages, all of them inside the platform chrome, and the drill-down is **repository-first**.
 *
 * `QitsMainLayout` is the root *route* component rather than something the shell templates, so the
 * bar and the navigation mount once and survive every navigation beneath them.
 *
 * **Why repository and not project.** Nothing in this store joins to a project: not one column in
 * any table. The one thing that would look like a join — an image name that equals a repository id
 * — is produced by qits-cd from a deploy plan's application name and merely coincides, and it
 * coincides for the slug-named repositories and for no npm package at all. A project-first tree
 * here would therefore be a tree of guesses. The real cross-store link is a tag that happens to be
 * a commit sha, and the image page offers *that* as a link out to the CI explorer — one click,
 * rather than a fiction in the URL structure.
 *
 * **Every level that costs a request is a path segment.** spa-ci carries its expansion in query
 * parameters because its levels are nested inside one screen; here each level is its own page, so
 * the path is already the state — the strongest form of the same rule, and one that makes every
 * level bookmarkable and back-button-correct without any code. The only local signals in this app
 * are for toggles that cost nothing: the summary's explanation and the image page's full digests.
 *
 * **The npm package segment carries a scope.** `@qits/ui-components` has a slash in it that is not
 * a separator; Angular's serialiser encodes it to `%2F` when a `routerLink` builds the URL and
 * decodes it back on the way in, so the segment survives the round trip intact. A maven coordinate
 * and a docs site name — `@userflows/qits-artifacts` — ride the same round trip for the same
 * reason, which is why all three are one `:param` rather than a wildcard.
 *
 * **`repositories/:repo/cleanup` is a segment because it is a place, not a panel.** It costs a
 * request, which is the rule above — but it earns the path for a second reason the other levels do
 * not have: it is the review a destructive action is authorised from, and a review that lives in a
 * modal over a table is a review with no address. As a route it is bookmarkable, it survives a
 * reload, and the back button leaves it rather than half-dismissing it.
 *
 * All eight pages load eagerly. There are eight of them, they share every component below them, and
 * a lazy chunk boundary would be ceremony that costs a round trip.
 *
 * The `**` route sits inside the layout: this application owns the whole of its own host, so an
 * unknown URL is an ordinary 404 and is drawn with the chrome around it.
 */
const OWN: Routes = [
  { path: '', component: RepositoriesPage },
  { path: 'repositories/:repo', component: RepositoryPage },
  { path: 'repositories/:repo/cleanup', component: CleanupPage },
  { path: 'repositories/:repo/images/:image', component: ImagePage },
  { path: 'repositories/:repo/packages/:package', component: PackagePage },
  { path: 'repositories/:repo/maven-packages/:coordinate', component: MavenPage },
  { path: 'repositories/:repo/daemons/:daemon', component: DaemonPage },
  { path: 'repositories/:repo/docs/:site', component: DocsPage },
];

/** The first segments this application's own routes spell, which no project and no group can be. */
const OWN_SEGMENTS: ReadonlySet<string> = new Set(
  OWN.map((route) => (route.path ?? '').split('/')[0]).filter((segment) => segment.length > 0),
);

/**
 * Whether the address is really `/<slug>/<group>/<repo>/…` and not a page of this app's own.
 *
 * The middle segment is the repository's **group** — its component where the platform gives it one,
 * its archetype category where it does not. Components are an **open** set that only the platform
 * knows, so this cannot be a membership test any more: a reader landing on a deep link has no
 * repository list yet, and a guard that waited for one would 404 the address it was asked about.
 * The vocabulary that is still closed is this application's own, so that is what decides —
 * `/qits/repositories/npm` is this app's page under a project, and three segments that spell none
 * of ours are a repository address.
 *
 * A first segment of ours is never a project, and neither is a category: that is the same rule
 * `parseScope` applies, so `/services` stays this app's own page. qits-projects refuses a slug that
 * spells a category or a routed segment, so the vocabularies cannot collide from the other side
 * either — and the chrome settles an unknown group as the project alone rather than as a 404.
 */
export const isRepositoryAddress: CanMatchFn = (_route, segments: UrlSegment[]) => {
  const project = segments[0]?.path;
  const group = segments[1]?.path;
  if (!project || !group) return false;
  if (OWN_SEGMENTS.has(project) || QITS_CATEGORIES.includes(project as QitsCategory)) return false;
  return !OWN_SEGMENTS.has(group);
};

/**
 * Every page above is addressable THREE TIMES — at its own path, under a project, and under the
 * repository whose artifacts it shows — and every spelling resolves to the same component.
 *
 * The project form is what the chrome's project picker navigates to: `UrlScope.select(slug)` goes
 * to `/<slug>/`, and without this route that pick would land on the 404 page.
 *
 * Order is the whole grammar, and it works because the three vocabularies cannot collide: a group
 * is never a slug, and neither is ever one of this app's own first segments. OWN routes come first,
 * so `/repositories/npm` is this app's listing and never a project called `repositories`; the
 * repository form follows, guarded on the group; the project form takes what is left; and `**`
 * closes the list.
 *
 * The pages read `inject(QITS_SCOPE).scope()` rather than these three params. A page that read them
 * would work in one spelling and be blank in the others.
 */
export const routes: Routes = [
  {
    path: '',
    component: QitsMainLayout,
    children: [
      ...OWN,
      { path: ':project/:group/:repository', canMatch: [isRepositoryAddress], children: OWN },
      { path: ':project', children: OWN },
      { path: '**', component: NotFound },
    ],
  },
];
