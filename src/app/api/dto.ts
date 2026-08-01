/**
 * The wire shapes qits-artifacts answers with, as this application reads them.
 *
 * Two rules run through the whole file and are worth stating once rather than at every field.
 *
 * **Every `sizeBytes` is a different question.** The store is content-addressed and deduped
 * globally, so bytes do not add up the way a table invites you to add them: a repository's size is
 * a union, an image's size is a union, and a *tag's* size is the set of bytes that manifest
 * references — which it shares with its siblings. Measured on the live store, summing per-tag
 * sizes inflates by 2.63× and summing per-image sizes by 1.08×. Nothing in this app may add two
 * size fields together, and nothing may print one without saying which of the three it is.
 *
 * **`null` means unknown, never zero.** A repository whose type has no size story answers `null`,
 * and an npm version whose tarball was never cached answers `null` for its size and its date. Zero
 * is a measurement; null is the absence of one, and the UI draws them differently.
 */

/**
 * The six archetypes `RepositoryType` allows, in their kebab wire form. Maven is not one.
 *
 * `oci-mirror` is the newest and the only one an operator can create: one row per registered
 * upstream registry, named by the namespace pulls travel under. See {@link MirrorUpstreamDto}.
 */
export type RepositoryTypeSlug =
  'ci-screenshots' | 'ci-videos' | 'oci-images' | 'oci-mirror' | 'npm-packages' | 'npm-proxy';

/**
 * One repository of the store.
 *
 * `itemCount` counts whatever the type stores — images for `oci-images`, packages for the two npm
 * types, records for the two ci ones — which is why the UI never prints the bare number without
 * the noun beside it.
 *
 * `sizeBytes` is this repository's own **referenced-blob union**, or null where the service cannot
 * answer one.
 */
export interface ArtifactRepositoryDto {
  readonly name: string;
  readonly type: RepositoryTypeSlug;
  readonly createdAt: string;
  readonly itemCount: number;
  readonly sizeBytes: number | null;
}

export interface RepositoriesResponse {
  readonly repositories: readonly ArtifactRepositoryDto[];
}

/**
 * One image name inside an OCI repository.
 *
 * `sizeBytes` is the **per-image union**: every distinct blob any of this image's manifests
 * references, counted once. It is the headline size this app shows, because it is the only figure
 * that is both nearly honest (1.08× over the true union) and cheap enough to compute per row.
 */
export interface OciImageDto {
  readonly name: string;
  readonly tagCount: number;
  readonly manifestCount: number;
  readonly sizeBytes: number;
}

export interface ImagesResponse {
  readonly images: readonly OciImageDto[];
}

/**
 * One tag of one image, and the manifest it points at.
 *
 * `sizeBytes` is that manifest's referenced bytes — **not additive**. Every rebuild of an image
 * shares its base layers with the tag before it, so a column of these summed is a number nothing
 * in the store corresponds to. The template labels it and never totals it.
 */
export interface OciTagDto {
  readonly tag: string;
  readonly digest: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export interface TagsResponse {
  readonly tags: readonly OciTagDto[];
}

/**
 * One package of an npm repository.
 *
 * For a proxy repository the listing comes from the cached versions rather than from the stored
 * packuments, so a package whose document was fetched but whose tarball never was can be missing
 * from this list. That is documented behaviour, not a gap to work around here.
 */
export interface NpmPackageDto {
  readonly name: string;
  readonly versionCount: number;
  readonly latest: string | null;
}

export interface PackagesResponse {
  readonly packages: readonly NpmPackageDto[];
}

/**
 * One version of one package.
 *
 * `tarballSizeBytes` and `publishedAt` are nullable because a proxied version may be indexed
 * without its bytes ever having been pulled. `distTags` are the dist-tags pointing at this
 * version; they are only meaningful for a hosted repository, since a proxy caches versions rather
 * than the upstream's tag pointers.
 */
export interface NpmVersionDto {
  readonly version: string;
  readonly tarballSizeBytes: number | null;
  readonly publishedAt: string | null;
  readonly distTags: readonly string[];
}

export interface VersionsResponse {
  readonly versions: readonly NpmVersionDto[];
}

/**
 * The honesty panel's numbers, and the reason it exists: these eight figures describe one store
 * and they do not reconcile, so the store-level view names all of them rather than picking a
 * flattering one.
 *
 * - `ociPerImageSumBytes` — the per-image unions added up, **over the hosted repositories only**.
 *   This is what the images table's column would total to, and it over-counts the blobs four
 *   images happen to share.
 * - `ociUnionBytes` — every distinct blob a *hosted* OCI manifest reaches, counted once. The
 *   mirror namespaces are **not** in it; they are `ociMirrorBytes`.
 * - `ociMirrorBytes` — every distinct blob a *mirror* namespace's manifests reach, counted once.
 *   Kept beside the hosted union rather than folded into it because the two answer different
 *   questions: one is what this platform published, the other is what it cached from three public
 *   registries and could fetch again.
 * - `orphanBytes` — bytes reachable from no manifest and no row at all: the ci-daemon binaries,
 *   uploaded through a blob session that never got a manifest. Invisible to every other view here,
 *   which is why the summary is the one place they can be reported.
 * - `npmPublishedBytes` / `npmProxyTarballBytes` — tarballs on disk, hosted and cached.
 * - `npmProxyPackumentBytes` — the cached *documents*, which live in the database rather than the
 *   blob store and outweigh the tarballs they index by roughly 3.8×. A cache figure that omits
 *   them is wrong by nearly 4×.
 * - `diskTotalBytes` — what the blob volume actually holds.
 */
export interface StoreSummaryDto {
  readonly ociPerImageSumBytes: number;
  readonly ociUnionBytes: number;
  readonly ociMirrorBytes: number;
  readonly orphanBytes: number;
  readonly npmPublishedBytes: number;
  readonly npmProxyTarballBytes: number;
  readonly npmProxyPackumentBytes: number;
  readonly diskTotalBytes: number;
}

/**
 * One registered upstream registry, and the single namespace pulls through it travel under.
 *
 * The `domain` is the key and the identity: it is the host the service dials on a cache miss. The
 * `slug` is the first path segment of every pull through this mirror — `quay` makes
 * `<host>/quay/quarkus/…` — and it names an `oci-mirror` repository row written in the same
 * transaction, which is why the two are never edited apart and why the slug cannot be moved once
 * content is cached under it.
 *
 * `cachedImages` counts image *names* under the namespace, not tags and not layers. A namespace
 * that has never been pulled through answers 0, which is a measurement rather than a gap: the
 * cache is lazy, and an upstream registered this minute holds nothing until a build asks for
 * something.
 */
export interface MirrorUpstreamDto {
  readonly domain: string;
  readonly slug: string;
  readonly createdAt: string;
  readonly cachedImages: number;
}

export interface MirrorUpstreamsResponse {
  readonly upstreams: readonly MirrorUpstreamDto[];
}

export interface MirrorUpstreamResponse {
  readonly upstream: MirrorUpstreamDto;
}
