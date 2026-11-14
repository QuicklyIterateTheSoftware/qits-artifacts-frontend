import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { QitsAppLinks } from '@qits/ui-components';
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
 * The application the cleanup reads and the one write go through (qits-2138). It is private: it
 * answers only on the private edge, which a browser reaches through the network-access tunnel.
 */
export const ORCHESTRATOR = 'qits-orchestrator';

/**
 * What the public edge says to a name it does not route — the text of its `text/plain` 404. No
 * service writes this sentence: qits-orchestrator's own 404, for a repository qits-artifacts does
 * not have, is qits-artifacts' `{"message": …}` envelope handed on verbatim.
 */
const EDGE_UNROUTED = 'is not an application this edge routes';

/**
 * Whether a failed qits-orchestrator call never reached qits-orchestrator — the browser is not on
 * the network-access tunnel — as opposed to qits-orchestrator (or qits-artifacts behind it)
 * answering with a refusal of its own.
 *
 * Read from the failure itself, and three answers say it:
 *
 * - **status 0**: no answer the page may read. A browser off the tunnel resolves the private name to
 *   the public edge, whose refusal carries no CORS headers, so the cross-origin caller sees a
 *   network error rather than the refusal — this is the common case, and a down tunnel is the other.
 * - **421**: the public edge recognising a private deployment's name and saying it is misdirected.
 * - **404 whose body is the edge's plain-text sentence** ({@link EDGE_UNROUTED}). A bare 404 is not
 *   enough, and that is the point of reading the text: the plan and sweep doors answer a real 404
 *   for a repository that does not exist, and that one must read as "no such repository", not as
 *   a tunnel problem. Its body is a JSON envelope, never this sentence.
 *
 * Not `QitsAppLinks.reachable()`: that is a second request with a five-second timeout, made before
 * the page can say anything, to learn what the failed call has just said on its own.
 */
export function orchestratorUnreachable(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) {
    return false;
  }
  if (error.status === 0 || error.status === 421) {
    return true;
  }
  return (
    error.status === 404 && typeof error.error === 'string' && error.error.includes(EDGE_UNROUTED)
  );
}

/**
 * Everything this app reads, and almost all of it from one upstream: qits-artifacts, through the
 * gateway, at `/artifacts/api`. There is no second service to join against — nothing in the store
 * carries a project id — so unlike spa-ci and spa-cd this repository has one `@Injectable` rather
 * than two.
 *
 * **The cleanup is the exception, and goes through qits-orchestrator (qits-2138).** A cleanup plan
 * is a keep-set, and the keep-set is the platform's live pins, which qits-artifacts can no longer
 * read: the services that answer them are private and it is public. qits-orchestrator is private,
 * reads the same pins for every gc run, and hands them to qits-artifacts — answering with
 * qits-artifacts' own JSON, verbatim, which is why the DTOs did not move. So the three cleanup calls
 * go to qits-orchestrator's own origin from the navigation, cross-origin, and carry the reader's
 * bearer (`qitsBearerInterceptor`, installed in `app.config.ts`) — the credential its doors admit.
 * The reads of the store itself stay same-origin and unauthenticated, as below.
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
 * carries the reader's bearer and nothing else: qits-orchestrator admits a person in one of its gc
 * roles, and it — not this page — holds the credential qits-artifacts accepts for the sweep. Before
 * qits-2138 the press went to qits-artifacts directly, whose sweep admits only `qits:system`, so a
 * person's press could only ever answer 403.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(QITS_API_BASE);
  private readonly links = inject(QitsAppLinks);

  /** `path` on qits-orchestrator's own origin, once the navigation has said where that is. */
  private orchestratorUrl(path: string): Promise<string> {
    return this.links.whenApiUrl(ORCHESTRATOR, path);
  }

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
   * Every repository's expected cleanup, in **one** call, through qits-orchestrator.
   *
   * There is deliberately no per-repository variant of this read. A plan costs a full census — a
   * walk of the blob volume and a pass over every protocol table — plus a read of every live pin
   * source, so a table that asked per row would cost N censuses and N pin reads to draw one column.
   * qits-artifacts answers every row from one run for exactly that reason, and qits-orchestrator
   * reads the pins once for it.
   */
  async gcRepositories(): Promise<GcRepositoriesPlanResponse> {
    const url = await this.orchestratorUrl('/orchestrator/api/artifacts/repositories');
    return firstValueFrom(this.http.get<GcRepositoriesPlanResponse>(url));
  }

  /** One repository's cleanup in full: what would die, what would not, and why each. A 404 here is
   * qits-artifacts saying it has no such repository; see {@link orchestratorUnreachable}. */
  async gcRepositoryPlan(repository: string): Promise<GcRepositoryPlanReportDto> {
    const url = await this.orchestratorUrl(
      `/orchestrator/api/artifacts/repositories/${encodeURIComponent(repository)}/plan`,
    );
    return firstValueFrom(this.http.get<GcRepositoryPlanReportDto>(url));
  }

  /**
   * Runs one repository's cleanup, and answers the receipt of what it did.
   *
   * **The only call this application makes that deletes anything**, and the scope is a path segment
   * rather than a parameter for that reason: a request that lost its scope would be a whole-store
   * sweep, while a request with a wrong segment is a 404. The body is empty on purpose — there is
   * no way to submit a plan, at any scope. qits-orchestrator reads the pins afresh and qits-artifacts
   * computes a new plan from them inside the request and applies that; the report this page showed
   * is what authorises the press, never what executes. A 409 means a gc run is active, and a 502
   * that qits-orchestrator could not get an answer from qits-artifacts.
   */
  async gcRepositorySweep(repository: string): Promise<GcRepositorySweepReportDto> {
    const url = await this.orchestratorUrl(
      `/orchestrator/api/artifacts/repositories/${encodeURIComponent(repository)}/sweep`,
    );
    return firstValueFrom(this.http.post<GcRepositorySweepReportDto>(url, {}));
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
