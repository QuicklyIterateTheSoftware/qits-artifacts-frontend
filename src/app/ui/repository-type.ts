import type { QitsBadgeTone } from '@qits/ui-components';
import type { RepositoryTypeSlug } from '../api/dto';

/**
 * What the five archetypes are, said in the UI's words.
 *
 * The list is closed and it is the service's: `artifact_repository.type` carries a named check
 * constraint, so a sixth type is a schema migration rather than a string. Maven is not one of them
 * — it is named in the service's README under "deliberately not here", and this app must not imply
 * otherwise by leaving a hopeful default in place.
 *
 * Tones are semantic and deliberately quiet. Nothing on this page is a status: a `ci-screenshots`
 * repository with no rows is not *failing*, it is a shape the golden-diff loop has never filled, so
 * it is drawn neutral rather than in a warning colour that would read as an incident.
 */
export function typeTone(type: RepositoryTypeSlug | string): QitsBadgeTone {
  switch (type) {
    case 'oci-images':
      return 'info';
    case 'npm-packages':
      return 'success';
    default:
      return 'neutral';
  }
}

/** One sentence about what a repository of this type holds, for the page under its heading. */
export function typeSummary(type: RepositoryTypeSlug | string): string {
  switch (type) {
    case 'oci-images':
      return 'Container images, pushed and pulled over the OCI Distribution API. That API is served at the host root, not under /artifacts/.';
    case 'npm-packages':
      return 'Packages published to this platform. Versions are immutable: republishing one is refused.';
    case 'npm-proxy':
      return 'A pull-through cache of an upstream npm registry. Nothing is published here — a push is refused because of what this repository is, not how it was configured.';
    case 'ci-screenshots':
      return 'Golden screenshots for the CI diff loop, paired by branch and commit.';
    case 'ci-videos':
      return 'Golden videos for the CI diff loop, paired by branch and commit.';
    default:
      return '';
  }
}

/** Whether this type has an image listing behind it. */
export function isOci(type: RepositoryTypeSlug | string): boolean {
  return type === 'oci-images';
}

/** Whether this type has a package listing behind it, hosted or cached. */
export function isNpm(type: RepositoryTypeSlug | string): boolean {
  return type === 'npm-packages' || type === 'npm-proxy';
}
