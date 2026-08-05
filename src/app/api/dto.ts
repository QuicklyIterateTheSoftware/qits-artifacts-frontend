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
 * The eight archetypes `RepositoryType` allows, in their kebab wire form.
 *
 * The list is closed and it is the service's: `artifact_repository.type` carries a named check
 * constraint, so a ninth is a schema migration rather than a string. This union was stale at six
 * for two releases — `maven-packages` and `daemon-binaries` shipped without it — and a stale union
 * is worse than a loose one here, because a type missing from it silently loses its tone, its
 * summary and the noun its count is drawn with.
 *
 * `oci-mirror` is the only one an operator can create: one row per registered upstream registry,
 * named by the namespace pulls travel under. See {@link MirrorUpstreamDto}.
 */
export type RepositoryTypeSlug =
  | 'ci-screenshots'
  | 'ci-videos'
  | 'oci-images'
  | 'oci-mirror'
  | 'npm-packages'
  | 'npm-proxy'
  | 'maven-packages'
  | 'daemon-binaries';

/**
 * One repository of the store.
 *
 * `itemCount` counts whatever the type stores — images for the two OCI types, packages for the two
 * npm ones, deployed files for `maven-packages`, published versions for `daemon-binaries`, records
 * for the two ci ones — which is why the UI never prints the bare number without the noun beside
 * it.
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
  /** Null until this tag's manifest has been read. */
  readonly accessedAt: string | null;
}

export interface TagsResponse {
  readonly tags: readonly OciTagDto[];
}

/** One OCI manifest, including manifests no tag currently names. */
export interface OciManifestDto {
  readonly digest: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly accessedAt: string | null;
  readonly tags: readonly string[];
}

export interface ManifestsResponse {
  readonly manifests: readonly OciManifestDto[];
}

/** A directly uploaded CI artifact. `metadata` remains deliberately flat and type-specific. */
export interface ArtifactRecordDto {
  readonly id: string;
  readonly repository: string;
  readonly mediatype: string;
  readonly size: number;
  readonly createdAt: string;
  readonly accessedAt: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ArtifactRecordsResponse {
  readonly records: readonly ArtifactRecordDto[];
}

/** Inclusive server-side bounds shared by the CI-record and OCI-tag listings. */
export interface ArtifactFilters {
  readonly accessedAfter?: string;
  readonly accessedBefore?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly neverAccessed?: boolean;
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

/*
 * Garbage collection — the one part of this store that can be made smaller.
 *
 * Three rules run through every shape below, and the UI is wrong if it draws any of them away.
 *
 * **These byte figures do not add up either, and for a new reason.** Each repository's figure is
 * what a cleanup of *that repository alone* would free: the store-wide reconciliation with only
 * its dead identities applied and everything else — other repositories of the same type included —
 * left standing. So a blob two repositories both condemn counts in neither of their figures and
 * dies only in a whole-store run. The column is a lower bound, never a total, and must never be
 * summed.
 *
 * **`structural` and `sweep` answer different questions.** `structural` is what the rule condemns
 * whatever the age of the files; `sweep` is what a run right now would actually unlink, with the
 * difference reported as withheld by the grace window. Neither can stand alone: the first promises
 * disk a run tonight will not deliver, the second reads as "nothing to clean" for a repository
 * pushed to this morning.
 *
 * **`executable` is about the run, not the row.** The service reads its live pins from qits-cd and
 * qits-ci once per run, and a source that cannot answer aborts the whole run — so no repository is
 * runnable while another is not, and the flag lives on the envelope rather than on each entry.
 */

/** One thing a cleanup would delete or keep, and the named rule that decided it. */
export interface GcIdentityDto {
  readonly repository: string;
  /** The type's own coordinate, spelled the way that type's tools spell it. */
  readonly identity: string;
  /** Why it dies, or why it lives. A list of doomed coordinates with no rule beside them cannot
   * be argued with, which is the whole point of showing both lists. */
  readonly rule: string;
}

/** How one run read one pin source — the provenance under every keep the plan claims. */
export interface GcPinSourceDto {
  readonly source: string;
  readonly url: string;
  readonly answered: boolean;
  readonly outcome: string;
  readonly readAt: string;
  readonly tookMillis: number;
  readonly pinCount: number;
  readonly keeps: readonly string[];
}

/** What this deployment has configured for a repository type, and what it means in a sentence. */
export interface GcTypeConfigurationDto {
  readonly type: RepositoryTypeSlug;
  /** `cache`, `own` or `excluded`. */
  readonly strategy: string | null;
  readonly window: string | null;
  readonly rule: string | null;
}

/** Blobs a plan would unlink, and the ones it would hold back because their files are young. */
export interface GcSweepPlanDto {
  readonly blobCount: number;
  readonly reclaimableBytes: number;
  readonly withheldByGraceWindow: number;
  readonly withheldBytes: number;
  readonly blobIds: readonly string[];
}

/** What an executed sweep did to the blobs, including every candidate it refused. */
export interface GcSweepOutcomeDto {
  readonly blobsUnlinked: number;
  readonly bytesReclaimed: number;
  readonly withheldByGraceWindow: number;
  readonly withheldBytes: number;
  /** Candidates something still named at unlink time. Refused, which is the mechanism working. */
  readonly stillReferenced: number;
  readonly alreadyGone: number;
  readonly unlinkedBlobIds: readonly string[];
}

/** Blobs no identity row names — reported on every plan and receipt, and never swept. */
export interface GcUntouchablePoolDto {
  readonly reason: string;
  readonly blobCount: number;
  readonly bytes: number;
  readonly blobIds: readonly string[];
}

/**
 * One repository's expected cleanup, in the figures a table can draw.
 *
 * `error` and `note` are the two ways zeros arrive with a reason: a type that refused to plan
 * (usually because the live pins could not be read) and a type nobody collects. A row drawn as `0`
 * with neither of them shown would claim the repository is already clean, which is a third fact.
 *
 * `blobsSweepable` / `reclaimableBytes` are the **structural** figures — see the note above.
 */
export interface GcRepositoryPlanSummaryDto {
  readonly repository: string;
  readonly type: RepositoryTypeSlug;
  readonly strategy: string | null;
  readonly note: string | null;
  readonly error: string | null;
  readonly identitiesCondemned: number;
  readonly identitiesKept: number;
  readonly blobsSweepable: number;
  readonly reclaimableBytes: number;
  readonly withheldByGraceWindow: number;
  readonly withheldBytes: number;
}

/** Every repository's expected cleanup, from one run of one plan. */
export interface GcRepositoriesPlanResponse {
  readonly generatedAt: string;
  readonly executable: boolean;
  readonly pinFailures: readonly string[];
  readonly graceWindow: string;
  readonly repositories: readonly GcRepositoryPlanSummaryDto[];
}

/**
 * One repository's cleanup in full — the report a run is authorised from.
 *
 * `dead` and `kept` are both here on purpose: the half that would be deleted is only reviewable
 * beside the half that would not.
 */
export interface GcRepositoryPlanReportDto {
  readonly repository: string;
  readonly type: RepositoryTypeSlug;
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly graceWindow: string;
  readonly executable: boolean;
  readonly pinFailures: readonly string[];
  readonly pins: readonly GcPinSourceDto[];
  readonly configuration: GcTypeConfigurationDto;
  readonly strategy: string | null;
  readonly note: string | null;
  readonly error: string | null;
  readonly dead: readonly GcIdentityDto[];
  readonly kept: readonly GcIdentityDto[];
  /** What a run now would unlink, plus what the grace window holds back. */
  readonly sweep: GcSweepPlanDto;
  /** What the rule condemns regardless of how young the files are. */
  readonly structural: GcSweepPlanDto;
  readonly untouchable: GcUntouchablePoolDto;
}

/**
 * What one executed cleanup of one repository did.
 *
 * `aborted` is not an error: it is the receipt of a run that stopped before the census because a
 * pin source could not answer, and it means nothing at all was deleted.
 */
export interface GcRepositorySweepReportDto {
  readonly repository: string;
  readonly type: RepositoryTypeSlug;
  readonly executedAt: string;
  readonly dryRun: boolean;
  readonly graceWindow: string;
  readonly aborted: string | null;
  readonly pins: readonly GcPinSourceDto[];
  readonly strategy: string | null;
  readonly note: string | null;
  readonly error: string | null;
  readonly deleted: readonly GcIdentityDto[];
  readonly withheldByGraceWindow: readonly GcIdentityDto[];
  readonly sweep: GcSweepOutcomeDto;
  readonly untouchable: GcUntouchablePoolDto;
}
