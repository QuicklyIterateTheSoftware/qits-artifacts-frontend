import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigation, provideQitsNavigationTree, provideQitsScope } from '@qits/ui-components';
import { routes } from '../app.routes';
import { NAVIGATE_AWAY } from '../ui/navigate-away';
import { LANDING_ORIGIN_WAIT_MS, RepositoryRedirect } from './repository-redirect';

/** Where the fixture navigation says `qits-landing` answers — its own host, not this one. */
const LANDING_ORIGIN = 'https://landing.qits.example';

/**
 * `repositories/:repo`, `repositories/:repo/images/:image`,
 * `repositories/:repo/maven-packages/:coordinate`, `repositories/:repo/daemons/:daemon`,
 * `repositories/:repo/docs/:site` and `repositories/:repo/cleanup` are each one entry inside
 * `OWN`, mounted three times — bare, under a project and under a repository — and since qits-2316
 * (repo), qits-2324 (image), qits-2325 (coordinate), qits-2327 (daemon), qits-2328 (site) and
 * qits-2329 (cleanup) all six reach this one component rather than `RepositoryPage`, `ImagePage`,
 * `MavenPage`, `DaemonPage`, `DocsPage` or `CleanupPage`. The point of this group is that the
 * hand-off actually happens in every spelling, of every mount, through real routing rather than a
 * stubbed `ActivatedRoute`: `app.routes.spec.ts` never instantiates a component (there is no
 * `RouterOutlet` there), so this is the only place a wrong param — or a wrong route `data` — on
 * one of the spellings would show up.
 */
describe('RepositoryRedirect', () => {
  describe('reached through routing', () => {
    let harness: RouterTestingHarness;
    let navigateAway: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      navigateAway = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes),
          provideLocationMocks(),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideQitsScope('repository'),
          provideQitsNavigationTree({ applications: { 'qits-landing': { origin: LANDING_ORIGIN } } }),
          { provide: NAVIGATE_AWAY, useValue: navigateAway },
        ],
      });
      harness = await RouterTestingHarness.create();
    });

    it('hands the bare spelling off to the landing app’s artifacts page', async () => {
      await harness.navigateByUrl('/repositories/qits');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/artifacts/repositories/qits`);
    });

    it('hands the project spelling off the same way', async () => {
      await harness.navigateByUrl('/qits/repositories/qits');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/artifacts/repositories/qits`);
    });

    it('hands the repository spelling off the same way', async () => {
      await harness.navigateByUrl('/qits/qits-artifacts/qits-artifacts-service/repositories/qits');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/artifacts/repositories/qits`);
    });

    /**
     * A repository name is one path segment no matter what it contains: `%2F` survives the round
     * trip as a literal slash inside the `repo` param rather than splitting it in two, the same way
     * a scoped npm package name does elsewhere in this route table. `encodeURIComponent` is what
     * puts it back on the way out.
     */
    it('escapes a scoped repository name on the way out', async () => {
      await harness.navigateByUrl('/repositories/a%2Fb');
      await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
      expect(navigateAway).toHaveBeenCalledWith(`${LANDING_ORIGIN}/artifacts/repositories/a%2Fb`);
    });

    /**
     * `repositories/:repo/images/:image`, the qits-2324 counterpart to the group above: the same
     * route object, mounted the same three times, now carrying an `image` param as well.
     */
    describe('the image route', () => {
      it('hands the bare spelling off to the landing app’s image page', async () => {
        await harness.navigateByUrl('/repositories/qits/images/qits-ci');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/images/qits-ci`,
        );
      });

      it('hands the project spelling off the same way', async () => {
        await harness.navigateByUrl('/qits/repositories/qits/images/qits-ci');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/images/qits-ci`,
        );
      });

      it('hands the repository spelling off the same way', async () => {
        await harness.navigateByUrl(
          '/qits/qits-artifacts/qits-artifacts-service/repositories/qits/images/qits-ci',
        );
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/images/qits-ci`,
        );
      });

      /**
       * An image name is one path segment no matter what it contains, the same rule as a scoped
       * repository name above: `%2F` survives as a literal slash inside the `image` param rather
       * than splitting it into two segments, and `encodeURIComponent` puts it back on the way out.
       */
      it('escapes a slashed image name on the way out, one segment round trip', async () => {
        await harness.navigateByUrl('/repositories/qits/images/build-images%2Fci-base');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/images/build-images%2Fci-base`,
        );
      });
    });

    /**
     * `repositories/:repo/maven-packages/:coordinate`, the qits-2325 counterpart to the two groups
     * above: the same route object, mounted the same three times, now carrying a `coordinate`
     * param instead of `image`.
     */
    describe('the maven-packages route', () => {
      const COORDINATE = 'eu.wohlben.qits:qits-eventstream';
      const ENCODED_COORDINATE = 'eu.wohlben.qits%3Aqits-eventstream';

      it('hands the bare spelling off to the landing app’s maven-package page', async () => {
        await harness.navigateByUrl(`/repositories/qits/maven-packages/${COORDINATE}`);
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/maven-packages/${ENCODED_COORDINATE}`,
        );
      });

      it('hands the project spelling off the same way', async () => {
        await harness.navigateByUrl(`/qits/repositories/qits/maven-packages/${COORDINATE}`);
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/maven-packages/${ENCODED_COORDINATE}`,
        );
      });

      /**
       * The repository spelling, on the same coordinate — which carries both a colon, which
       * `encodeURIComponent` escapes to `%3A`, and dots, which it leaves alone. All three spellings
       * above prove the escaping, not a fourth dedicated case, because every maven coordinate looks
       * like this one: the colon is not an edge case for this param the way a slash is for an image
       * name.
       */
      it('hands the repository spelling off the same way, escaping the colon on the way out', async () => {
        await harness.navigateByUrl(
          `/qits/qits-artifacts/qits-artifacts-service/repositories/qits/maven-packages/${COORDINATE}`,
        );
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/maven-packages/${ENCODED_COORDINATE}`,
        );
      });
    });

    /**
     * `repositories/:repo/daemons/:daemon`, the qits-2327 counterpart to the three groups above:
     * the same route object, mounted the same three times, now carrying a `daemon` param as well.
     */
    describe('the daemon route', () => {
      it('hands the bare spelling off to the landing app’s daemon page', async () => {
        await harness.navigateByUrl('/repositories/daemons/daemons/qits-agent');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/daemons/daemons/qits-agent`,
        );
      });

      it('hands the project spelling off the same way', async () => {
        await harness.navigateByUrl('/qits/repositories/daemons/daemons/qits-agent');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/daemons/daemons/qits-agent`,
        );
      });

      it('hands the repository spelling off the same way', async () => {
        await harness.navigateByUrl(
          '/qits/qits-artifacts/qits-artifacts-service/repositories/daemons/daemons/qits-agent',
        );
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/daemons/daemons/qits-agent`,
        );
      });
    });

    /**
     * `repositories/:repo/docs/:site`, the qits-2328 counterpart to the four groups above: the
     * same route object, mounted the same three times, now carrying a `site` param as well.
     */
    describe('the docs route', () => {
      it('hands the bare spelling off to the landing app’s docs page', async () => {
        await harness.navigateByUrl('/repositories/docs/docs/qits-artifacts');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/docs/docs/qits-artifacts`,
        );
      });

      it('hands the project spelling off the same way', async () => {
        await harness.navigateByUrl('/qits/repositories/docs/docs/qits-artifacts');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/docs/docs/qits-artifacts`,
        );
      });

      it('hands the repository spelling off the same way', async () => {
        await harness.navigateByUrl(
          '/qits/qits-artifacts/qits-artifacts-service/repositories/docs/docs/qits-artifacts',
        );
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/docs/docs/qits-artifacts`,
        );
      });

      /**
       * A site name is one path segment no matter what it contains, the same rule as a scoped
       * image name above: `%2F` survives as a literal slash inside the `site` param rather than
       * splitting it into two segments, and `encodeURIComponent` puts it back on the way out —
       * `@changelog/qits-qits` becomes the one segment `%40changelog%2Fqits-qits`.
       */
      it('escapes a slashed, scoped site name on the way out, one segment round trip', async () => {
        await harness.navigateByUrl('/repositories/docs/docs/%40changelog%2Fqits-qits');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/docs/docs/%40changelog%2Fqits-qits`,
        );
      });
    });

    /**
     * `repositories/:repo/cleanup`, the qits-2329 counterpart to the groups above: the same route
     * object, mounted the same three times, carrying only a `repo` param — same as the bare
     * `repositories/:repo` mount — and told apart from it by the route's own `data.landing`.
     */
    describe('the cleanup route', () => {
      it('hands the bare spelling off to the landing app’s cleanup page', async () => {
        await harness.navigateByUrl('/repositories/qits/cleanup');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/cleanup`,
        );
      });

      it('hands the project spelling off the same way', async () => {
        await harness.navigateByUrl('/qits/repositories/qits/cleanup');
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/cleanup`,
        );
      });

      it('hands the repository spelling off the same way', async () => {
        await harness.navigateByUrl(
          '/qits/qits-artifacts/qits-artifacts-service/repositories/qits/cleanup',
        );
        await vi.waitFor(() => expect(navigateAway).toHaveBeenCalled());
        expect(navigateAway).toHaveBeenCalledWith(
          `${LANDING_ORIGIN}/artifacts/repositories/qits/cleanup`,
        );
      });
    });
  });

  /**
   * The origin-resolution fallback chain, in isolation from the routes that decide this component
   * gets reached at all — the group above covers that. `ActivatedRoute` is stubbed directly: this
   * component reads only its own route's `repo` param, so a bare snapshot carrying it is the whole
   * fixture.
   */
  describe('when the landing origin never answers', () => {
    function configure(repo: string, ...providers: unknown[]): { navigateAway: ReturnType<typeof vi.fn> } {
      const navigateAway = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: convertToParamMap({ repo }), data: {} } },
          },
          { provide: NAVIGATE_AWAY, useValue: navigateAway },
          ...providers,
        ],
      });
      return { navigateAway };
    }

    /**
     * A navigation that never answers must not strand the reader on this blank page forever —
     * {@link LANDING_ORIGIN_WAIT_MS} is the backstop. `provideQitsNavigation()` makes the one real
     * request this component waits on; leaving it unflushed models a navigation that is slow, or
     * dead, rather than one that answered with nothing.
     */
    it('gives up waiting past its bound and falls back to a relative, same-origin path', async () => {
      vi.useFakeTimers();
      try {
        const { navigateAway } = configure(
          'qits',
          provideHttpClient(),
          provideHttpClientTesting(),
          provideQitsNavigation(),
        );
        TestBed.createComponent(RepositoryRedirect);
        const http = TestBed.inject(HttpTestingController);
        http.expectOne('/main-navigation');
        expect(navigateAway).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(LANDING_ORIGIN_WAIT_MS);

        // Neither qits-landing's own origin nor the environment's is known without an answer, so
        // the last fallback — same-origin, a bare path — is what the reader gets rather than a hang.
        expect(navigateAway).toHaveBeenCalledWith('/artifacts/repositories/qits');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
