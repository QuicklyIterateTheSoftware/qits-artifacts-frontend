import type { QitsBadgeTone } from '@qits/ui-components';
import type { RepositoryTypeSlug } from '../api/dto';

/**
 * What the six archetypes are, said in the UI's words.
 *
 * The list is closed and it is the service's: `artifact_repository.type` carries a named check
 * constraint, so a seventh type is a schema migration rather than a string. Maven is not one of
 * them — it is named in the service's README under "deliberately not here", and this app must not
 * imply otherwise by leaving a hopeful default in place.
 *
 * Tones are semantic and deliberately quiet. Nothing on this page is a status: a `ci-screenshots`
 * repository with no rows is not *failing*, it is a shape the golden-diff loop has never filled, so
 * it is drawn neutral rather than in a warning colour that would read as an incident.
 *
 * **The two cached types are neutral and the two hosted ones are not**, which is the only
 * distinction the colours carry: `npm-packages` and `oci-images` hold bytes this platform produced
 * and is the only copy of, while `npm-proxy` and `oci-mirror` hold bytes borrowed from a public
 * registry that could be fetched again. That is worth a glance's worth of difference and nothing
 * stronger.
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
    case 'oci-mirror':
      return 'A pull-through cache of one upstream container registry. Everything here arrived because a build asked for it and the registry did not have it — nothing is pushed, and a push is refused because of what this repository is.';
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

/**
 * Whether this type has an image listing behind it.
 *
 * Both OCI types do, and from the same endpoint: a mirror namespace's cached content is ordinary
 * `oci_manifest` and `oci_tag` rows, so `…/images` answers for `quay` exactly as it answers for
 * `qits`. Drawing a mirror namespace as a listing-less shape would be hiding rows the service is
 * already handing out.
 */
export function isOci(type: RepositoryTypeSlug | string): boolean {
  return type === 'oci-images' || type === 'oci-mirror';
}

/**
 * Whether this repository is one of the mirror namespaces — the only type whose *existence* an
 * operator controls, and therefore the only one with a management page behind it.
 */
export function isMirror(type: RepositoryTypeSlug | string): boolean {
  return type === 'oci-mirror';
}

/** Whether this type has a package listing behind it, hosted or cached. */
export function isNpm(type: RepositoryTypeSlug | string): boolean {
  return type === 'npm-packages' || type === 'npm-proxy';
}
