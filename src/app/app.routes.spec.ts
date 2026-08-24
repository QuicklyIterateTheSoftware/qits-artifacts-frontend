import { provideZonelessChangeDetection } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { CleanupPage } from './cleanup/cleanup-page';
import { ImagePage } from './image/image-page';
import { NotFound } from './not-found/not-found';
import { RepositoriesPage } from './repositories/repositories-page';
import { RepositoryPage } from './repository/repository-page';

/**
 * Every page is addressable twice — its own path, and the same path under the repository whose
 * artifacts it shows — and both must land on the SAME component. A second component for the scoped
 * form is the failure this guards against: it would compile, render, and drift.
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

    expect(await resolve('/repositories/qits')).toBe(RepositoryPage);
    expect(await resolve('/qits/services/qits-ci/repositories/qits')).toBe(RepositoryPage);

    expect(await resolve('/repositories/qits/images/qits%2Fqits-ci')).toBe(ImagePage);
    expect(await resolve('/qits/images/qits-oci/repositories/qits/images/qits%2Fbase')).toBe(
      ImagePage,
    );

    expect(await resolve('/repositories/qits/cleanup')).toBe(CleanupPage);
    expect(await resolve('/qits/libs/qits-blobstore/repositories/qits/cleanup')).toBe(CleanupPage);
  });

  /**
   * The literal wins, which is why OWN routes come first. `repositories` is a plausible project
   * slug, and the ordering is what keeps it this app's own listing rather than a scope.
   */
  it('reads a literal first segment as this app own page, not as a project', async () => {
    expect(await resolve('/repositories/npm')).toBe(RepositoryPage);
  });

  /** A second segment that is not a category is not a scope, so the 404 page takes it. */
  it('does not read an arbitrary three-segment path as a scope', async () => {
    expect(await resolve('/qits/nonsense/qits-ci')).toBe(NotFound);
    expect(await resolve('/nothing/here/at/all')).toBe(NotFound);
  });
});
