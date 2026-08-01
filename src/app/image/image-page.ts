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
import { ArtifactsApi } from '../api/artifacts-api';
import type { OciImageDto, OciTagDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import {
  ciExplorerLink,
  formatBytes,
  formatInstant,
  isCommitSha,
  plural,
  shortDigest,
  shortSha,
} from '../ui/format';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';

/**
 * One image: its tags, the manifest each points at, and the one honest link this platform has
 * between its artifact store and its build history.
 *
 * **Load budget: `2 + 0`.**
 *
 * - `GET …/repositories/{repo}/images` — for this image's per-image union, which is the headline
 *   size and is not derivable from the tags below without adding numbers that must not be added.
 * - `GET …/repositories/{repo}/images/{image}/tags` — the table.
 *
 * Nothing per row: a tag arrives with its digest, its size and its date.
 *
 * **The size column is per-manifest and the caption says so twice.** Summing it is the 2.63× error:
 * every rebuild of an image shares its base layers with the tag before it, so twenty-two tags of
 * qits-ci reference roughly the same bytes twenty-two times. The headline above the table is the
 * union over all of them, and it is the only figure on this page that answers "how much disk does
 * this image cost".
 *
 * **The commit link is an offer, not a claim.** `oci_tag.tag` is undeclared — nothing in the schema
 * says a tag is a commit sha, qits-cd simply tags that way, and not uniformly: some images carry
 * abbreviated shas beside full ones. So a tag that *looks* like a sha gets a link out to the CI
 * explorer, opened at the repository whose name matches this image's, with the sha printed for the
 * reader to match against the run list. It is not a link to a run: qits-ci addresses a run by its
 * own id and has no route and no lookup that takes a commit, so a run URL would be one this
 * application invented. See `ciExplorerLink` for why the repository is addressed by image name and
 * what happens when that convention does not hold.
 *
 * The full-digest toggle is a **local signal**. It costs no request, so there is nothing to restore
 * from a URL and nothing worth a history entry.
 */
@Component({
  selector: 'app-image-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsButton, RouterLink],
  templateUrl: './image-page.html',
  styleUrls: ['../ui/page.css', './image-page.css'],
})
export class ImagePage {
  private readonly api = inject(ArtifactsApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatBytes = formatBytes;
  protected readonly formatInstant = formatInstant;
  protected readonly isCommitSha = isCommitSha;
  protected readonly shortDigest = shortDigest;
  protected readonly shortSha = shortSha;
  protected readonly ciExplorerLink = ciExplorerLink;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: convertToParamMap({}),
  });

  protected readonly repoName = computed(() => this.params().get('repo') ?? '');
  protected readonly imageName = computed(() => this.params().get('image') ?? '');

  protected readonly tags = signal<Loadable<readonly OciTagDto[]>>(LOADING);

  /**
   * The image's own row, for the headline union. Its failure is quiet on purpose: the tags are
   * this page's content, and an error banner about a size figure sitting above a table that
   * arrived fine would be louder than what it reports. The headline falls back to saying the size
   * is unknown, which is true.
   */
  protected readonly image = signal<OciImageDto | null>(null);

  protected readonly rows = computed(() => {
    const state = this.tags();
    return state.kind === 'ready' ? state.value : [];
  });

  /** Full `sha256:…` digests rather than the shortened form. Free, so it is a local signal. */
  protected readonly fullDigests = signal(false);

  /** `4.04 GiB (union over this image's blobs) · 22 tags · 22 manifests` */
  protected readonly lede = computed(() => {
    const image = this.image();
    const size = formatBytes(image?.sizeBytes ?? null);
    if (!image) {
      return `${size} — the image listing has not answered`;
    }
    return (
      `${size} (union over this image's blobs) · ` +
      `${plural(image.tagCount, 'tag')} · ${plural(image.manifestCount, 'manifest')}`
    );
  });

  /** Manifests this table cannot show, because nothing points at them. */
  protected readonly untagged = computed(() => {
    const image = this.image();
    return image ? Math.max(0, image.manifestCount - image.tagCount) : 0;
  });

  protected readonly untaggedNote = computed(() => plural(this.untagged(), 'manifest'));

  constructor() {
    effect(() => {
      const repository = this.repoName();
      const image = this.imageName();
      if (repository && image) {
        void this.reload();
      }
    });
  }

  protected async reload(): Promise<void> {
    await Promise.all([this.loadImage(), this.loadTags()]);
  }

  private async loadImage(): Promise<void> {
    try {
      const images = await this.api.images(this.repoName());
      this.image.set(images.find((row) => row.name === this.imageName()) ?? null);
    } catch {
      // An annotation, not the content. The headline says the size is unknown and the page stands.
      this.image.set(null);
    }
  }

  protected async loadTags(): Promise<void> {
    this.tags.set(LOADING);
    try {
      this.tags.set(ready(await this.api.tags(this.repoName(), this.imageName())));
    } catch (error) {
      this.tags.set(failed(error));
    }
  }

  protected toggleDigests(): void {
    this.fullDigests.update((full) => !full);
  }

  protected digest(tag: OciTagDto): string {
    return this.fullDigests() ? tag.digest : shortDigest(tag.digest);
  }

  /** What the link out to the CI explorer says it will do, spelled out for a screen reader. */
  protected ciLinkLabel(tag: string): string {
    return `Open the CI explorer at repository ${this.imageName()}, to look for commit ${shortSha(tag)}`;
  }
}
