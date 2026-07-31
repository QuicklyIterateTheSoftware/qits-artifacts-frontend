import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * The shell, and deliberately nothing else. The chrome — sidebar, top bar, the links out to the
 * other qits SPAs — is `QitsMainLayout` behind the `''` route (see app.routes.ts), which is what
 * keeps it standing while the pages underneath it change.
 *
 * Bootstrapping renders this above everything `/artifacts/` will ever serve, so the one thing it
 * owns is the outlet: markup put here would sit above the layout, where no route could replace it.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
