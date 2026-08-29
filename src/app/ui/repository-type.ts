import type { QitsBadgeTone } from '@qits/ui-components';
import type { RepositoryTypeSlug } from '../api/dto';

/**
 * What the seven archetypes are, said in the UI's words.
 *
 * Tones are semantic and deliberately quiet. Nothing on this page is a status: a `ci-screenshots`
 * repository with no rows is not *failing*, it is a shape the golden-diff loop has never filled, so
 * it is drawn neutral rather than in a warning colour that would read as an incident.
 *
 * **The two ci types are neutral and the five content types are not**, which is the only
 * distinction the colours carry: `npm-packages`, `oci-images`, `maven-packages`, `daemon-binaries`
 * and `docs` hold what this platform publishes, while the ci types hold the golden-diff loop's own
 * records. That is worth a glance's worth of difference and nothing stronger.
 */
export function typeTone(type: RepositoryTypeSlug | string): QitsBadgeTone {
  switch (type) {
    case 'oci-images':
    case 'daemon-binaries':
    case 'docs':
      return 'info';
    case 'npm-packages':
    case 'maven-packages':
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
    case 'ci-screenshots':
      return 'Golden screenshots for the CI diff loop, paired by branch and commit.';
    case 'ci-videos':
      return 'Golden videos for the CI diff loop, paired by branch and commit.';
    case 'maven-packages':
      return 'A hosted maven repository. Release paths are immutable: re-deploying one with different bytes is refused, and a version is a set of files rather than a single one.';
    case 'daemon-binaries':
      return "The platform's own daemon executables, downloaded and run by the services that launch them. Versions are immutable, and a pin a bootstrap re-reads is what resolves one.";
    case 'docs':
      return 'Published documentation bundles — a version is a set of files, published whole and evicted whole. Versions are immutable, so a bundle URL never changes meaning.';
    default:
      return '';
  }
}

/** Whether this type has an image listing behind it. */
export function isOci(type: RepositoryTypeSlug | string): boolean {
  return type === 'oci-images';
}

/** Whether this type has a package listing behind it. */
export function isNpm(type: RepositoryTypeSlug | string): boolean {
  return type === 'npm-packages';
}
