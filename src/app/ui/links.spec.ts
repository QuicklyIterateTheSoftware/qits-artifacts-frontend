import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideQitsNavigationTree,
  QITS_BROWSER_ORIGIN,
  QITS_SCOPE,
  type QitsScope,
  type QitsScopeSource,
} from '@qits/ui-components';
import { ArtifactsLinks } from './links';

/**
 * The two kinds of address this app writes: its own pages, which must stay inside the scope on
 * screen, and the one link out to qits-ci, which must not be a URL this application invented.
 */
describe('ArtifactsLinks', () => {
  const REPOSITORY: QitsScope = {
    project: 'qits',
    category: 'services',
    repository: 'qits-ci',
  };

  function scopeSource(scope: QitsScope): QitsScopeSource {
    return {
      scope: signal(scope),
      projectId: signal(undefined),
      repositoryId: signal(undefined),
      routing: 'repository',
      // Nothing to navigate: this spec asks for addresses, it never follows one.
      select: () => undefined,
    };
  }

  /** The platform as the edge states it: qits-ci on a host, under a segment, or named nowhere. */
  function links(scope: QitsScope, ci: 'hosted' | 'segment' | 'absent'): ArtifactsLinks {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: QITS_SCOPE, useValue: scopeSource(scope) },
        { provide: QITS_BROWSER_ORIGIN, useValue: 'https://registry.dev.example.com' },
        provideQitsNavigationTree({
          environment: 'dev',
          origin: 'https://dev.example.com',
          slots: {
            'services.details':
              ci === 'absent'
                ? []
                : [
                    {
                      app: 'qits-ci',
                      label: 'CI',
                      host: ci === 'hosted' ? 'ci' : null,
                      origin:
                        ci === 'hosted' ? 'https://ci.dev.example.com' : 'https://dev.example.com',
                      path: '/ci',
                    },
                  ],
          },
        }),
      ],
    });
    return TestBed.inject(ArtifactsLinks);
  }

  it('prefixes its own pages with the scope on screen', () => {
    expect(links(REPOSITORY, 'hosted').commands('repositories', 'qits')).toEqual([
      '/',
      'qits',
      'services',
      'qits-ci',
      'repositories',
      'qits',
    ]);
  });

  /** The same prefix from a scope the chrome read in the component form: one segment either way. */
  it('prefixes its own pages with a component scope just as well', () => {
    const component: QitsScope = {
      project: 'qits',
      group: 'qits-ci',
      repository: 'qits-ci-service',
    };
    expect(links(component, 'hosted').commands('repositories', 'qits')).toEqual([
      '/',
      'qits',
      'qits-ci',
      'qits-ci-service',
      'repositories',
      'qits',
    ]);
    expect(links(component, 'hosted').ciExplorer('qits/qits-ci')).toBe(
      'https://ci.dev.example.com/qits/qits-ci/qits-ci-service/',
    );
  });

  it('leaves an unscoped address at the root', () => {
    expect(links({}, 'hosted').commands('repositories', 'qits')).toEqual([
      '/',
      'repositories',
      'qits',
    ]);
  });

  it('opens the ci host at the same scope when there is one', () => {
    expect(links(REPOSITORY, 'hosted').ciExplorer('qits/qits-ci')).toBe(
      'https://ci.dev.example.com/qits/services/qits-ci/',
    );
  });

  it('falls back to the query form with no repository in scope', () => {
    expect(links({}, 'hosted').ciExplorer('qits/qits-ci')).toBe(
      'https://ci.dev.example.com/?repo=qits%2Fqits-ci',
    );
  });

  /**
   * An application with no host of its own has no scoped address either — `href` drops the scope
   * rather than spelling a URL that would 404 — so the scoped form would open the tree with no
   * filter at all. The query form is the better answer there, and it survives one release of the
   * flat navigation.
   */
  it('uses the query form against a platform that serves ci under a segment', () => {
    expect(links(REPOSITORY, 'segment').ciExplorer('qits/qits-ci')).toBe(
      'https://dev.example.com/ci/?repo=qits%2Fqits-ci',
    );
  });

  /**
   * A platform naming qits-ci nowhere gets no address at all, and the template draws no link.
   *
   * There is nothing to fall back on: every service is on a host of its own, so a `/ci/` segment
   * under the environment origin would be a URL this application invented.
   */
  it('writes no address at all when the platform names no ci application', () => {
    expect(links(REPOSITORY, 'absent').ciExplorer('qits/qits-ci')).toBeUndefined();
    expect(links({}, 'absent').ciExplorer('qits/qits-ci')).toBeUndefined();
  });
});
