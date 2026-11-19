import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QITS_SCOPE, type QitsScope, type QitsScopeSource } from '@qits/ui-components';
import { ArtifactsLinks } from './links';

/**
 * The one kind of address this app writes: its own pages, which must stay inside the scope on
 * screen rather than drop out of it.
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

  function links(scope: QitsScope): ArtifactsLinks {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: QITS_SCOPE, useValue: scopeSource(scope) },
      ],
    });
    return TestBed.inject(ArtifactsLinks);
  }

  it('prefixes its own pages with the scope on screen', () => {
    expect(links(REPOSITORY).commands('repositories', 'qits')).toEqual([
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
    expect(links(component).commands('repositories', 'qits')).toEqual([
      '/',
      'qits',
      'qits-ci',
      'qits-ci-service',
      'repositories',
      'qits',
    ]);
  });

  it('leaves an unscoped address at the root', () => {
    expect(links({}).commands('repositories', 'qits')).toEqual(['/', 'repositories', 'qits']);
  });
});
