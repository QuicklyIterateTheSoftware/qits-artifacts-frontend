import type { Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';

/**
 * One route, and it is the platform's shared skeleton rather than a page. Mounting the layout as
 * the *component* of `''` — not inside the shell's template — is what lets it survive every
 * navigation beneath it: only its own `<router-outlet />` re-renders.
 *
 * `children` is empty on purpose. The registry's pages come later; the layout lands first so
 * `/artifacts/` already answers in the same chrome as the rest of the platform.
 */
export const routes: Routes = [{ path: '', component: QitsMainLayout, children: [] }];
