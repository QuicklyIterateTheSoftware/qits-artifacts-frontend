import { inject, Injectable } from '@angular/core';
import { QitsAppLinks, QITS_SCOPE, scopeCommands } from '@qits/ui-components';

/**
 * Every address this application writes, in one place — because none of them is a constant any
 * more.
 *
 * <p>An in-app link is relative to <b>the scope on screen</b>: the same page is served at
 * `/repositories/qits` and at `/qits/services/qits-artifacts/repositories/qits`, and a
 * `routerLink` starting at `/` would drop out of the second one. The prefix comes from the URL, so
 * a template asks for `commands('repositories', name)` and never spells the leading slash itself.
 *
 * <p>A cross-application link is an origin the platform states, not a path compiled in. It is a
 * full-document navigation to a different Angular application, so `routerLink` would compile and go
 * nowhere.
 *
 * <p>This is a service rather than functions in `format.ts` because it has to inject two things.
 * `format.ts` is pure conversions and stays that way.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactsLinks {
  private readonly scopeSource = inject(QITS_SCOPE, { optional: true });
  private readonly appLinks = inject(QitsAppLinks);

  /** Router commands for one of this app's own pages, inside whatever scope is on screen. */
  commands(...path: readonly string[]): string[] {
    return [...scopeCommands(this.scopeSource?.scope()), ...path];
  }

  /**
   * The deep link out to the CI explorer for a sha-tagged image, and the one place in this app
   * where the two stores are joined at all.
   *
   * <p><b>It addresses the repository, not the run</b>, and that is the honest shape rather than a
   * limitation worked around. qits-ci has no route that takes a commit sha and no endpoint that
   * turns one into a run id, so a link claiming to open "the run for this commit" would be a URL
   * this application invented. Opening its tree at the repository, with the sha printed beside the
   * link for the reader to match, is a true thing to offer.
   *
   * <p>With a repository in scope the address is the platform's own: the same scope path on the ci
   * host, which that application reads exactly as this one does. Without one — or against a
   * platform that does not serve qits-ci on a host of its own, where the scope path would 404 —
   * it falls back to the query form, and the image NAME is what identifies the repository there.
   * That is a naming convention rather than a key: qits-cd derives an image name from the deploy
   * plan's application name, and it happens to equal the git-host directory name qits-ci keys runs
   * by. When it does not, the tree opens with that node simply absent.
   */
  ciExplorer(imageName: string): string | undefined {
    const scope = this.scopeSource?.scope();
    if (scope?.repository && this.appLinks.origin('qits-ci')) {
      return this.appLinks.href('qits-ci', '', scope);
    }
    return this.appLinks.href(
      'qits-ci',
      `?repo=${encodeURIComponent(imageName)}`,
      undefined,
      '/ci/',
    );
  }
}
