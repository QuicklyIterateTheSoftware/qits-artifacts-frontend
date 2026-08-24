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

  /** The platform as the edge states it: qits-ci on a host, or on none at all. */
  function links(scope: QitsScope, hosted: boolean): ArtifactsLinks {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: QITS_SCOPE, useValue: scopeSource(scope) },
        { provide: QITS_BROWSER_ORIGIN, useValue: 'https://registry.dev.example.com' },
        provideQitsNavigationTree({
          environment: 'dev',
          origin: 'https://dev.example.com',
          slots: {
            'services.details': [
              {
                app: 'qits-ci',
                label: 'CI',
                host: hosted ? 'ci' : null,
                origin: hosted ? 'https://ci.dev.example.com' : 'https://dev.example.com',
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
    expect(links(REPOSITORY, true).commands('repositories', 'qits')).toEqual([
      '/',
      'qits',
      'services',
      'qits-ci',
      'repositories',
      'qits',
    ]);
  });

  it('leaves an unscoped address at the root', () => {
    expect(links({}, true).commands('repositories', 'qits')).toEqual(['/', 'repositories', 'qits']);
  });

  it('opens the ci host at the same scope when there is one', () => {
    expect(links(REPOSITORY, true).ciExplorer('qits/qits-ci')).toBe(
      'https://ci.dev.example.com/qits/services/qits-ci/',
    );
  });

  it('falls back to the query form with no repository in scope', () => {
    expect(links({}, true).ciExplorer('qits/qits-ci')).toBe(
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
    expect(links(REPOSITORY, false).ciExplorer('qits/qits-ci')).toBe(
      'https://dev.example.com/ci/?repo=qits%2Fqits-ci',
    );
  });
});
