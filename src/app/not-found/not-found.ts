import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArtifactsLinks } from '../ui/links';

/**
 * A URL on this host that this app does not recognise.
 *
 * It renders a small page and stops there. Every path the platform routes elsewhere — the API, the
 * wire stacks, `/v2` — is claimed by the service before the client's fallback sees it, so anything
 * that reaches here is genuinely a page nobody wrote.
 *
 * One caveat worth stating for whoever lands here from a `/v2/…` address: the OCI Distribution API
 * is served at the host root and answers before this client does. `quarkus.quinoa
 * .ignored-path-prefixes` is what keeps a mistyped registry path a 404 rather than this page.
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
    <p><a [routerLink]="links.commands()">Back to the repositories</a></p>
  `,
  styles: `
    h1 {
      font-size: 1.25rem;
      margin: 0 0 0.5rem;
    }
  `,
})
export class NotFound {
  protected readonly links = inject(ArtifactsLinks);
}
