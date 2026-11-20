import { provideZonelessChangeDetection } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { CleanupPage } from './cleanup/cleanup-page';
import { DocsPage } from './docs/docs-page';
import { NotFound } from './not-found/not-found';
import { RepositoriesPage } from './repositories/repositories-page';
import { RepositoryRedirect } from './repository/repository-redirect';

/**
 * Every page is addressable three times — its own path, the same path under a project, and the same
 * path under the repository whose artifacts it shows — and all three must land on the SAME
 * component. A second component for a scoped form is the failure this guards against: it would
 * compile, render, and drift.
 *
 * <p>Components are never created here. Without a `RouterOutlet` the router builds the state and
 * stops, so this reads what each URL resolves to without booting the chrome or any of its reads.
 */
describe('app routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter(routes), provideLocationMocks()],
    });
  });

  async function resolve(url: string): Promise<unknown> {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    let node = router.routerState.snapshot.root;
    while (node.firstChild) node = node.firstChild;
    return node.component;
  }

  it('serves every own page under a repository as well', async () => {
    expect(await resolve('/')).toBe(RepositoriesPage);
    expect(await resolve('/qits/services/qits-ci')).toBe(RepositoriesPage);

    expect(await resolve('/repositories/qits')).toBe(RepositoryRedirect);
    expect(await resolve('/qits/services/qits-ci/repositories/qits')).toBe(RepositoryRedirect);

    expect(await resolve('/repositories/qits/images/qits%2Fqits-ci')).toBe(RepositoryRedirect);
    expect(await resolve('/qits/images/qits-oci/repositories/qits/images/qits%2Fbase')).toBe(
      RepositoryRedirect,
    );

    expect(await resolve('/repositories/qits/cleanup')).toBe(CleanupPage);
    expect(await resolve('/qits/libs/qits-blobstore/repositories/qits/cleanup')).toBe(CleanupPage);

    expect(await resolve('/repositories/daemons/daemons/qits-agent')).toBe(RepositoryRedirect);
    expect(await resolve('/qits/services/qits-artifacts/repositories/daemons/daemons/qits-agent')).toBe(
      RepositoryRedirect,
    );

    expect(await resolve('/repositories/docs/docs/%40userflows%2Fqits-artifacts')).toBe(DocsPage);
    expect(
      await resolve('/qits/services/qits-artifacts/repositories/docs/docs/%40userflows%2Fqits-artifacts'),
    ).toBe(DocsPage);
  });

  it('serves every own page under a project as well', async () => {
    // `/qits` is where the chrome's project picker sends this app when a reader picks `qits`.
    expect(await resolve('/qits')).toBe(RepositoriesPage);
    expect(await resolve('/qits/repositories/qits')).toBe(RepositoryRedirect);
    expect(await resolve('/qits/repositories/qits/cleanup')).toBe(CleanupPage);
    expect(await resolve('/qits/repositories/qits/images/qits%2Fbase')).toBe(RepositoryRedirect);
    expect(await resolve('/qits/repositories/daemons/daemons/qits-agent')).toBe(RepositoryRedirect);
    expect(await resolve('/qits/repositories/docs/docs/%40userflows%2Fqits-artifacts')).toBe(
      DocsPage,
    );
  });

  /**
   * The site name survives the round trip as ONE parameter, separator included. A route that let
   * `%2F` split into two segments would resolve to the 404 page here and — worse — would reach the
   * component with half a name if it did not.
   */
  it('carries a multi-segment docs site name through as a single parameter', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/repositories/docs/docs/%40userflows%2Fqits-artifacts');
    let node = router.routerState.snapshot.root;
    while (node.firstChild) node = node.firstChild;
    expect(node.component).toBe(DocsPage);
    expect(node.paramMap.get('site')).toBe('@userflows/qits-artifacts');
    expect(node.paramMap.get('repo')).toBe('docs');
  });

  /**
   * The literal wins, which is why OWN routes come first. `repositories` is a plausible project
   * slug, and the ordering is what keeps it this app's own listing rather than a scope — against
   * the project form as much as against the repository one.
   */
  it('reads a literal first segment as this app own page, not as a project', async () => {
    expect(await resolve('/repositories/npm')).toBe(RepositoryRedirect);
    expect(await resolve('/repositories/npm/cleanup')).toBe(CleanupPage);
  });

  /**
   * The middle segment is the repository's group, and a component is an open set: any segment the
   * platform can name has to resolve, because no list has answered when a deep link is opened.
   */
  it('serves every own page under a repository addressed by its component', async () => {
    expect(await resolve('/qits/qits-artifacts/qits-artifacts-service')).toBe(RepositoriesPage);
    expect(await resolve('/qits/qits-artifacts/qits-artifacts-service/repositories/npm')).toBe(
      RepositoryRedirect,
    );
    expect(
      await resolve('/qits/qits-ci/qits-ci-service/repositories/qits/images/qits%2Fbase'),
    ).toBe(RepositoryRedirect);
  });

  /** A group is never one of this app's own first segments, and a project is never a category. */
  it('does not read this app own segments as a scope', async () => {
    // `repositories` in the middle is this app's page under a project, not a group.
    expect(await resolve('/qits/repositories/npm')).toBe(RepositoryRedirect);
    // A category in segment one is no project, and the rest matches no page of ours.
    expect(await resolve('/services/qits-ci/repositories')).toBe(NotFound);
    expect(await resolve('/nothing/here/at/all')).toBe(NotFound);
  });
});
