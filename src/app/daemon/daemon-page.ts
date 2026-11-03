import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, convertToParamMap } from '@angular/router';
import { QitsButton } from '@qits/ui-components';
import { QitsBearerFetch } from '@qits/angular';
import { ArtifactsApi } from '../api/artifacts-api';
import type { DaemonVersionDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { formatBytes, formatInstant, plural, shortDigest } from '../ui/format';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { ArtifactsLinks } from '../ui/links';

/**
 * One daemon: its published versions, the digest each one is, and the bytes behind each.
 *
 * **Load budget: `1 + 0`.**
 *
 * - `GET …/repositories/{repo}/daemons/{daemon}/versions` — the table.
 *
 * Nothing per row: a version arrives with its digest, its size and its two dates. The type read
 * the package page makes is deliberately *not* made here — it buys that page a column, and there is
 * no column on this one whose truth depends on it. A request that changes nothing on screen is a
 * request this page does not send.
 *
 * **The version cell fetches rather than navigates.** It used to be a real `<a [href]>` to
 * `/artifacts/daemons/<name>/<version>` — the same version-addressed GET a bootstrap script makes —
 * as a full-document navigation off this application; a `routerLink` would have compiled, rendered
 * as a link, and gone to the 404 page. That route is role-guarded, though, and a navigation sends
 * no bearer (epic qits-543), so the cell is a button that fetches with the bearer and saves the
 * blob instead (`QitsBearerFetch.download`, Judgement call).
 *
 * **The digest is shortened for the cell and whole in the title.** An operator pinning a version
 * needs the exact `sha256:<hex>` the wire uttered, and a table twelve hex characters wide is the
 * only way the other four columns fit; `shortDigest` plus the full value on hover is the trade the
 * image page's tag table makes, minus its toggle — there is one digest column here rather than two,
 * so a control to widen both would be a control over one thing.
 *
 * **A size here is the row's own and is still not totalled.** A daemon version *is* one blob, so
 * unlike the OCI tables nothing on this page double-counts — but the headline above it is the
 * per-daemon *union*, and a column that summed to something larger than the figure above it would
 * read as a contradiction rather than as the two different questions they are.
 */
@Component({
  selector: 'app-daemon-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsButton, RouterLink],
  templateUrl: './daemon-page.html',
  styleUrls: ['../ui/page.css', './daemon-page.css'],
})
export class DaemonPage {
  protected readonly links = inject(ArtifactsLinks);

  private readonly api = inject(ArtifactsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly bearerFetch = inject(QitsBearerFetch);

  protected readonly formatBytes = formatBytes;
  protected readonly formatInstant = formatInstant;
  protected readonly shortDigest = shortDigest;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: convertToParamMap({}),
  });

  protected readonly repoName = computed(() => this.params().get('repo') ?? '');

  /** A daemon name is bounded to `[a-z0-9][a-z0-9._-]{0,63}` by the wire, so it never carries a
   * slash and never needs the encode/decode round trip a scoped npm package does. */
  protected readonly daemonName = computed(() => this.params().get('daemon') ?? '');

  protected readonly versions = signal<Loadable<readonly DaemonVersionDto[]>>(LOADING);

  protected readonly rows = computed(() => {
    const state = this.versions();
    return state.kind === 'ready' ? state.value : [];
  });

  protected readonly lede = computed(() => {
    const state = this.versions();
    return state.kind === 'ready' ? `${plural(state.value.length, 'version')} · newest first` : '';
  });

  constructor() {
    effect(() => {
      const repository = this.repoName();
      const daemon = this.daemonName();
      if (repository && daemon) {
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    this.versions.set(LOADING);
    try {
      this.versions.set(ready(await this.api.daemonVersions(this.repoName(), this.daemonName())));
    } catch (error) {
      this.versions.set(failed(error));
    }
  }

  /** The version-addressed download on the daemon wire, which carries no repository segment. */
  private downloadUrl(version: DaemonVersionDto): string {
    return `/artifacts/daemons/${encodeURIComponent(this.daemonName())}/${encodeURIComponent(version.version)}`;
  }

  /** Fetched with the bearer rather than navigated to, since the route is role-guarded. */
  protected async download(version: DaemonVersionDto): Promise<void> {
    await this.bearerFetch.download(
      this.downloadUrl(version),
      `${this.daemonName()}-${version.version}`,
    );
  }
}
