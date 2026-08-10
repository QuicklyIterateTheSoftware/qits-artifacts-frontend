import type { Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { CleanupPage } from './cleanup/cleanup-page';
import { ImagePage } from './image/image-page';
import { NotFound } from './not-found/not-found';
import { PackagePage } from './package/package-page';
import { RepositoriesPage } from './repositories/repositories-page';
import { RepositoryPage } from './repository/repository-page';

/**
 * Five pages, all of them inside the platform chrome, and the drill-down is **repository-first**.
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
 * decodes it back on the way in, so the segment survives the round trip intact.
 *
 * **`repositories/:repo/cleanup` is a segment because it is a place, not a panel.** It costs a
 * request, which is the rule above — but it earns the path for a second reason the other levels do
 * not have: it is the review a destructive action is authorised from, and a review that lives in a
 * modal over a table is a review with no address. As a route it is bookmarkable, it survives a
 * reload, and the back button leaves it rather than half-dismissing it.
 *
 * All five pages load eagerly. There are five of them, they share every component below them, and a
 * lazy chunk boundary would be ceremony that costs a round trip.
 *
 * The `**` route sits inside the layout: `/artifacts/` is a segment this application owns outright,
 * so an unknown URL under it is an ordinary 404 and is drawn with the chrome around it.
 */
export const routes: Routes = [
  {
    path: '',
    component: QitsMainLayout,
    children: [
      { path: '', component: RepositoriesPage },
      { path: 'repositories/:repo', component: RepositoryPage },
      { path: 'repositories/:repo/cleanup', component: CleanupPage },
      { path: 'repositories/:repo/images/:image', component: ImagePage },
      { path: 'repositories/:repo/packages/:package', component: PackagePage },
      { path: '**', component: NotFound },
    ],
  },
];
