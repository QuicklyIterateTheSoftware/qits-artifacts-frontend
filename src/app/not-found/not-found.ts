import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * A URL under `/artifacts/` that this app does not recognise.
 *
 * It renders a small page and stops there. It deliberately does **not** copy spa-home's behaviour
 * of handing the URL back to the gateway: that is the landing page's job, and it is correct only
 * because spa-home is mounted at the root, where an unknown first segment is another micro
 * frontend. Here the segment is already ours, so there is nobody to hand it to.
 *
 * One caveat worth stating for whoever lands here from a `/v2/…` address: the OCI Distribution API
 * is **not** served under `/artifacts/`. It is mounted at the host root, and this SPA's ignored
 * path prefixes 404 `/artifacts/v2` on purpose.
 */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1>No such page here</h1>
    <p>
      This is the artifact explorer. It has a repository overview, a page per repository, and a page
      per image or package — and nothing else.
    </p>
    <p><a routerLink="/">Back to the repositories</a></p>
  `,
  styles: `
    h1 {
      font-size: 1.25rem;
      margin: 0 0 0.5rem;
    }
  `,
})
export class NotFound {}
