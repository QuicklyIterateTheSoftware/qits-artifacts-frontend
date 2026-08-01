import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
import type {
  ArtifactRepositoryDto,
  ImagesResponse,
  NpmPackageDto,
  NpmVersionDto,
  OciImageDto,
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
 * All six calls are `GET`, all are unauthenticated, and all are one-shot: `firstValueFrom` unwraps
 * the observable immediately, because a promise is what the pages' `async` methods want.
 * `HttpClient` on the fetch backend rather than bare `fetch()` buys two things —
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
 */
@Injectable({ providedIn: 'root' })
export class ArtifactsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(QITS_API_BASE);

  /**
   * The five repositories, each with its type, how many things it holds, and its own byte union.
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

  /** The store's seven figures. Read once, on the overview, and nowhere else. */
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
  async tags(repository: string, image: string): Promise<readonly OciTagDto[]> {
    const response = await firstValueFrom(
      this.http.get<TagsResponse>(
        `${this.base}/artifacts/api/repositories/${encodeURIComponent(repository)}` +
          `/images/${encodeURIComponent(image)}/tags`,
      ),
    );
    return response.tags;
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
}
