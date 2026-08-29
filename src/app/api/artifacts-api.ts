import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
import type {
  ArtifactRepositoryDto,
  ArtifactRecordDto,
  ArtifactRecordsResponse,
  ArtifactFilters,
  DaemonDto,
  DaemonsResponse,
  DaemonVersionDto,
  DaemonVersionsResponse,
  DocsSiteDto,
  DocsSitesResponse,
  DocsVersionDto,
  DocsVersionsResponse,
  GcRepositoriesPlanResponse,
  GcRepositoryPlanReportDto,
  GcRepositorySweepReportDto,
  ImagesResponse,
  ManifestsResponse,
  MavenPackageDto,
  MavenPackagesResponse,
  MavenVersionDto,
  MavenVersionsResponse,
  NpmPackageDto,
  NpmVersionDto,
  OciImageDto,
  OciManifestDto,
  OciTagDto,
  PackagesResponse,
  RepositoriesResponse,
  StoreSummaryDto,
  TagsResponse,
  VersionsResponse,
} from './dto';

/**
 * Everything this app reads, and it reads from exactly one upstream: qits-artifacts, through the
 * gateway, at `/artifacts/api`. There is no second service to join against — nothing in the store
 * carries a project id — so unlike spa-ci and spa-cd this repository has one `@Injectable` rather
 * than two.
 *
 * All calls are one-shot: `firstValueFrom` unwraps the observable immediately, because a promise is
 * what the pages' `async` methods want. `HttpClient` on the fetch backend rather than bare
 * `fetch()` buys two things —
 * `HttpTestingController`, which is the whole basis of this repository's specs, and a call that
 * goes through `window.fetch`, where the platform's browser telemetry can see it.
 *
 * `httpResource()` would suit these reads well and is deliberately not used: it is still marked
 * experimental in the pinned `@angular/common`, and this service is the seam that makes adopting
 * it later a change inside the page components rather than a rewrite.
 *
 * **Path segments are encoded, and one of them has to be.** An npm package name can be scoped —
 * `@qits/ui-components` — and the slash in it is not a path separator; `encodeURIComponent` turns
 * it into `@qits%2Fui-components`, which is the form the service's route expects.
 *
 * **There is one write, and it deletes.** {@link ArtifactsApi.gcRepositorySweep} unlinks files. It
 * sends no token, and that is not an omission to fill in later: no page in any qits SPA has ever
 * sent a machine token, because the browser is not one of the callers those tokens exist for.
 * qits-artifacts guards every write under `/artifacts/api` with a static `X-Artifacts-Token` that
 * only a shell or a provisioning script holds, so when a deployment sets that token this write
 * answers 401 and the page says exactly that. Storing a token in this app would be inventing a
 * credential store to defeat a guard rather than to satisfy it.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(QITS_API_BASE);

  /**
   * Every repository, with its type, how many things it holds, and its own byte union.
   *
   * This is the one read every page makes, because a repository's *type* is what decides which
   * listing endpoint applies to it — there is no way to ask a repository what it is on its own.
   */
  async repositories(): Promise<readonly ArtifactRepositoryDto[]> {
    const response = await firstValueFrom(
      this.http.get<RepositoriesResponse>(`${this.base}/artifacts/api/repositories`),
    );
    return response.repositories;
  }

  /** The store's five figures. Read once, on the overview, and nowhere else. */
  storeSummary(): Promise<StoreSummaryDto> {
    return firstValueFrom(
      this.http.get<StoreSummaryDto>(`${this.base}/artifacts/api/store/summary`),
    );
  }

  /** The image names of an OCI repository. 404 for a repository that does not exist, 400 for one
   * that is not an OCI repository — both of which the page reports rather than swallows. */
  async images(repository: string): Promise<readonly OciImageDto[]> {
    const response = await firstValueFrom(
      this.http.get<ImagesResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}/images`,
      ),
    );
    return response.images;
  }

  /** One image's tags, each with the manifest it points at. The sizes here are per-manifest and
   * must not be added; see {@link OciTagDto}. */
  async tags(
    repository: string,
    image: string,
    filters: ArtifactFilters = {},
  ): Promise<readonly OciTagDto[]> {
    const response = await firstValueFrom(
      this.http.get<TagsResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}` +
          `/images/${encodeURIComponent(image)}/tags`,
        { params: filterParams(filters) },
      ),
    );
    return response.tags;
  }

  /** Direct CI uploads. Other repository types use their protocol-aware listing instead. */
  async artifactRecords(
    repository: string,
    filters: ArtifactFilters = {},
  ): Promise<readonly ArtifactRecordDto[]> {
    const response = await firstValueFrom(
      this.http.get<ArtifactRecordsResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}/blobs`,
        { params: filterParams(filters) },
      ),
    );
    return response.records;
  }

  /** Every manifest, including displaced and index-child manifests with no current tag. */
  async manifests(
    repository: string,
    image: string,
    filters: ArtifactFilters = {},
  ): Promise<readonly OciManifestDto[]> {
    const response = await firstValueFrom(
      this.http.get<ManifestsResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}` +
          `/images/${encodeURIComponent(image)}/manifests`,
        { params: filterParams(filters) },
      ),
    );
    return response.manifests;
  }

  /** The packages of an npm repository, hosted or proxied — the same endpoint for both, because
   * the distinction between them is which repository you asked, not a flag on the answer. */
  async packages(repository: string): Promise<readonly NpmPackageDto[]> {
    const response = await firstValueFrom(
      this.http.get<PackagesResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}/packages`,
      ),
    );
    return response.packages;
  }

  /** One package's versions. The package name is encoded whole, scope and all. */
  async versions(repository: string, packageName: string): Promise<readonly NpmVersionDto[]> {
    const response = await firstValueFrom(
      this.http.get<VersionsResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}` +
          `/packages/${encodeURIComponent(packageName)}/versions`,
      ),
    );
    return response.versions;
  }

  async mavenPackages(repository: string): Promise<readonly MavenPackageDto[]> {
    const response = await firstValueFrom(this.http.get<MavenPackagesResponse>(
      `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}/maven-packages`,
    ));
    return response.packages;
  }

  async mavenVersions(repository: string, coordinate: string): Promise<readonly MavenVersionDto[]> {
    const response = await firstValueFrom(this.http.get<MavenVersionsResponse>(
      `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}` +
        `/maven-packages/${encodeURIComponent(coordinate)}/versions`,
    ));
    return response.versions;
  }

  /**
   * The daemons of a `daemon-binaries` repository.
   *
   * **The wire below this has no enumeration at all.** `/artifacts/daemons` answers 404 for the
   * bare segment and every route under it is version-addressed, so a bootstrap can fetch a binary
   * whose coordinates it already holds and nothing can ask what exists. This is that question, and
   * it is only askable here.
   */
  async daemons(repository: string): Promise<readonly DaemonDto[]> {
    const response = await firstValueFrom(
      this.http.get<DaemonsResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}/daemons`,
      ),
    );
    return response.daemons;
  }

  /** One daemon's versions, newest first, each with the digest a deployment would pin. */
  async daemonVersions(repository: string, daemon: string): Promise<readonly DaemonVersionDto[]> {
    const response = await firstValueFrom(
      this.http.get<DaemonVersionsResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}` +
          `/daemons/${encodeURIComponent(daemon)}/versions`,
      ),
    );
    return response.versions;
  }

  /** The documentation sites of a `docs` repository, with the per-site union the open wire
   * catalog deliberately withholds. */
  async docsSites(repository: string): Promise<readonly DocsSiteDto[]> {
    const response = await firstValueFrom(
      this.http.get<DocsSitesResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}/docs`,
      ),
    );
    return response.sites;
  }

  /** One site's versions, newest first. The site name is encoded whole — `@userflows/qits-docs`
   * is one name with a slash in it, exactly like a scoped npm package. */
  async docsVersions(repository: string, site: string): Promise<readonly DocsVersionDto[]> {
    const response = await firstValueFrom(
      this.http.get<DocsVersionsResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}` +
          `/docs/${encodeURIComponent(site)}/versions`,
      ),
    );
    return response.versions;
  }

  /**
   * Every repository's expected cleanup, in **one** call.
   *
   * There is deliberately no per-repository variant of this read. A plan costs the service a full
   * census — a walk of the blob volume and a pass over every protocol table — plus two
   * cross-service calls to qits-cd and qits-ci, so a table that asked per row would cost N censuses
   * and 2N of those calls to draw one column. The service answers every row from one run for
   * exactly that reason.
   */
  gcRepositories(): Promise<GcRepositoriesPlanResponse> {
    return firstValueFrom(
      this.http.get<GcRepositoriesPlanResponse>(`${this.base}/artifacts/api/gc/repositories`),
    );
  }

  /** One repository's cleanup in full: what would die, what would not, and why each. */
  gcRepositoryPlan(repository: string): Promise<GcRepositoryPlanReportDto> {
    return firstValueFrom(
      this.http.get<GcRepositoryPlanReportDto>(
        `${this.base}/artifacts/api/gc/repositories/${encodeURIComponent(repository)}/plan`,
      ),
    );
  }

  /**
   * Runs one repository's cleanup, and answers the receipt of what it did.
   *
   * **The only call this application makes that deletes anything**, and the scope is a path segment
   * rather than a parameter for that reason: a request that lost its scope would be a whole-store
   * sweep, while a request with a wrong segment is a 404. The body is empty on purpose — there is
   * no way to submit a plan, at any scope. The service computes a fresh one inside the request and
   * applies that; the report this page showed is what authorises the press, never what executes.
   */
  gcRepositorySweep(repository: string): Promise<GcRepositorySweepReportDto> {
    return firstValueFrom(
      this.http.post<GcRepositorySweepReportDto>(
        `${this.base}/artifacts/api/gc/repositories/${encodeURIComponent(repository)}/sweep`,
        {},
      ),
    );
  }
}

function filterParams(filters: ArtifactFilters): HttpParams {
  let params = new HttpParams();
  const values: readonly (readonly [string, string | number | boolean | undefined])[] = [
    ['accessed-after', filters.accessedAfter],
    ['accessed-before', filters.accessedBefore],
    ['created-after', filters.createdAfter],
    ['created-before', filters.createdBefore],
    ['min-size', filters.minSize],
    ['max-size', filters.maxSize],
    ['never-accessed', filters.neverAccessed],
  ];
  for (const [name, value] of values) {
    if (value !== undefined && value !== '') {
      params = params.set(name, String(value));
    }
  }
  return params;
}
