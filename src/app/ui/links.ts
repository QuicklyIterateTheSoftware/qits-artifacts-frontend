import { inject, Injectable } from '@angular/core';
import { QITS_SCOPE, scopeCommands } from '@qits/ui-components';

/**
 * Every in-app address this application writes, in one place — because none of them is a constant
 * any more.
 *
 * <p>An in-app link is relative to <b>the scope on screen</b>: the same page is served at
 * `/repositories/qits` and at `/qits/services/qits-artifacts/repositories/qits`, and a
 * `routerLink` starting at `/` would drop out of the second one. The prefix comes from the URL, so
 * a template asks for `commands('repositories', name)` and never spells the leading slash itself.
 *
 * <p>This is a service rather than functions in `format.ts` because it has to inject the scope.
 * `format.ts` is pure conversions and stays that way.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactsLinks {
  private readonly scopeSource = inject(QITS_SCOPE, { optional: true });

  /** Router commands for one of this app's own pages, inside whatever scope is on screen. */
  commands(...path: readonly string[]): string[] {
    return [...scopeCommands(this.scopeSource?.scope()), ...path];
  }
}
