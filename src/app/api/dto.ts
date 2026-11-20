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
 * The seven archetypes this service holds, in their kebab wire form.
 *
 * Every one of them is **hosted**: bytes this platform produced and is the only copy of. The
 * pull-through caches — `oci-mirror`, `npm-proxy`, `maven-proxy` — moved out to qits-platform-mirror
 * and this service can no longer answer with one, so naming them here would be describing another
 * service's store.
 *
 * A stale union is worse than a loose one, because a type missing from it silently loses its tone,
 * its summary and the noun its count is drawn with. `docs` is the proof: it shipped on the wire
 * while this union still said six, so a docs repository fell through every `switch` below to the
 * default arm and was drawn as a CI type that had never held a row — right down to the sentence
 * about the golden-diff loop.
 */
export type RepositoryTypeSlug =
  | 'ci-screenshots'
  | 'ci-videos'
  | 'oci-images'
  | 'npm-packages'
  | 'maven-packages'
  | 'daemon-binaries'
  | 'docs';

/**
 * One repository of the store.
 *
 * `itemCount` counts whatever the type stores — images for the two OCI types, packages for the two
 * npm ones, deployed files for `maven-packages`, published versions for `daemon-binaries` and for
 * `docs`, records for the two ci ones — which is why the UI never prints the bare number without
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

/** One package of an npm repository. */
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
 * `tarballSizeBytes` and `publishedAt` stay nullable: null is the absence of a measurement, and the
 * table prints "not measured" rather than a plausible zero. `distTags` are the dist-tags pointing at
 * this version.
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

export interface MavenPackageDto {
  readonly name: string;
  readonly versionCount: number;
  readonly sizeBytes: number;
}
export interface MavenPackagesResponse { readonly packages: readonly MavenPackageDto[]; }
export interface MavenVersionDto {
  readonly version: string;
  readonly files: readonly string[];
  readonly sizeBytes: number;
  readonly publishedAt: string;
}
export interface MavenVersionsResponse { readonly versions: readonly MavenVersionDto[]; }

/**
 * One daemon of the `daemon-binaries` repository, folded from its published versions.
 *
 * There is no daemon table behind this: a daemon exists exactly as long as a published version
 * names it, which is why `latestVersion` and `latestPublishedAt` are not nullable — a daemon with
 * no versions is never enumerated at all.
 *
 * `sizeBytes` is the **per-daemon union**: every distinct blob any of its versions names, counted
 * once. Two versions built from identical bytes are one blob in the store, so summing the versions
 * below would report disk this daemon does not occupy. Σ over the daemons of a repository is ≥ the
 * repository's own union for the same reason, and neither column is ever totalled here.
 */
export interface DaemonDto {
  readonly name: string;
  readonly versionCount: number;
  readonly latestVersion: string;
  readonly latestPublishedAt: string;
  readonly sizeBytes: number;
}

export interface DaemonsResponse {
  readonly daemons: readonly DaemonDto[];
}

/**
 * One documentation site of a `docs` repository, folded from its published versions.
 *
 * A site name may contain a slash — `@userflows/qits-artifacts` is **one** site rather than a scope
 * and a name — which is the npm scope problem again and takes the same treatment everywhere: the
 * API client encodes it whole, and Angular's serialiser round-trips it through the URL as `%2F`.
 *
 * `sizeBytes` is the **per-site union** over its distinct blobs. Docs versions share blobs heavily
 * and by design — the fonts and the unchanged chunks of a Storybook build are byte-identical across
 * releases and are stored once — so adding the versions' published totals overstates a site several
 * times over.
 */
export interface DocsSiteDto {
  readonly name: string;
  readonly versionCount: number;
  readonly latestVersion: string;
  readonly latestPublishedAt: string;
  readonly sizeBytes: number;
}

export interface DocsSitesResponse {
  readonly sites: readonly DocsSiteDto[];
}

/**
 * One published version of one documentation site — the unit that is published whole and evicted
 * whole.
 *
 * `fileCount` is the number of paths this version serves, not a distinct-blob count: it answers
 * what shape the bundle is, and a bundle that ships the same bytes at two paths really does serve
 * two paths. `sizeBytes` is the union over the distinct blobs behind them, so the two columns
 * deliberately do not derive from one another.
 *
 * `metadata` is the flat string map the publisher rode on `X-Artifacts-Meta-*` headers —
 * `git.branch.name` and `git.commit.hash` are the two this UI reads by name. Never null: a version
 * published without any arrives as `{}`, because "no metadata" and "metadata not read here" must
 * not be drawn alike.
 */
export interface DocsVersionDto {
  readonly version: string;
  readonly fileCount: number;
  readonly sizeBytes: number;
  readonly publishedAt: string;
  /** Null until a file of this version has been served — never, not zero. */
  readonly accessedAt: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface DocsVersionsResponse {
  readonly versions: readonly DocsVersionDto[];
}

/**
 * The honesty panel's numbers, and the reason it exists: these five figures describe one store
 * and they do not reconcile, so the store-level view names all of them rather than picking a
 * flattering one.
 *
 * - `ociPerImageSumBytes` — the per-image unions added up. This is what the images table's column
 *   would total to, and it over-counts the blobs two images happen to share.
 * - `ociUnionBytes` — every distinct blob an OCI manifest reaches, counted once.
 * - `orphanBytes` — bytes reachable from no manifest and no row at all, uploaded through a blob
 *   session that never got a manifest. Invisible to every other view here, which is why the
 *   summary is the one place they can be reported.
 * - `npmPublishedBytes` — the tarballs on disk.
 * - `diskTotalBytes` — what the blob volume actually holds.
 *
 * The service still answers the pull-through cache's figures, and every one of them is now a hard
 * zero: the caches live in qits-platform-mirror. They are left out of this interface rather than
 * read and drawn, because a labelled zero is a claim about an empty cache instead of about a cache
 * that is somewhere else.
 */
export interface StoreSummaryDto {
  readonly ociPerImageSumBytes: number;
  readonly ociUnionBytes: number;
  readonly orphanBytes: number;
  readonly npmPublishedBytes: number;
  readonly diskTotalBytes: number;
}

/*
 * Garbage collection — the one part of this store that can be made smaller.
 *
 * **The full plan and the receipt of a run are not shapes here any more.** Both lived in this
 * file, read and run from this application's own cleanup page, until qits-2329 handed that page
 * off to the landing app, the same way `repositories/:repo` and `repositories/:repo/images/:image`
 * already had (qits-2316, qits-2324) — the landing app now defines its own shapes for them. What
 * stays here is the one read behind the repository list's Cleanup column: every repository's
 * figure from a single run, never a per-repository plan.
 *
 * Two rules run through the shapes below, and the UI is wrong if it draws either of them away.
 *
 * **These byte figures do not add up either, and for a new reason.** Each repository's figure is
 * what a cleanup of *that repository alone* would free: the store-wide reconciliation with only
 * its dead identities applied and everything else — other repositories of the same type included —
 * left standing. So a blob two repositories both condemn counts in neither of their figures and
 * dies only in a whole-store run. The column is a lower bound, never a total, and must never be
 * summed.
 *
 * **`executable` is about the run, not the row.** The service reads its live pins from qits-cd and
 * qits-ci once per run, and a source that cannot answer aborts the whole run — so no repository is
 * runnable while another is not, and the flag lives on the envelope rather than on each entry.
 */

/**
 * One repository's expected cleanup, in the figures a table can draw.
 *
 * `error` and `note` are the two ways zeros arrive with a reason: a type that refused to plan
 * (usually because the live pins could not be read) and a type nobody collects. A row drawn as `0`
 * with neither of them shown would claim the repository is already clean, which is a third fact.
 *
 * `blobsSweepable` / `reclaimableBytes` are what the rule condemns regardless of how young the
 * files are; `withheldByGraceWindow` / `withheldBytes` are the part of that a run right now would
 * still hold back, reported separately rather than subtracted away.
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
