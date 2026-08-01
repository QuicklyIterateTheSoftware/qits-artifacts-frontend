import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { QitsCard } from '@qits/ui-components';
import type { StoreSummaryDto } from '../api/dto';
import { Async } from '../ui/async';
import { formatBytes } from '../ui/format';
import type { Loadable } from '../ui/loadable';

/** One number, with the two things a number on this page may never be shown without. */
interface Figure {
  /** What it measures. */
  readonly label: string;
  /** Already formatted, unit included — there is no path through this component that prints a
   * bare integer. */
  readonly value: string;
  /** How it was counted, in one clause. This is the field that keeps the panel honest. */
  readonly kind: string;
}

interface Group {
  readonly title: string;
  readonly figures: readonly Figure[];
}

/**
 * The honesty panel: seven figures about one store that do not reconcile, all named.
 *
 * It exists because of a measurement. The same OCI content is 10.63 GiB added up per tag, 4.36 GiB
 * added up per image, and 4.04 GiB counted once — a 2.63× spread with no bug behind it, just
 * content-addressed blobs shared between every rebuild of an image. A UI that picked one of those
 * and called it "the size" would be believed, and would be wrong for two of the three questions a
 * reader might have been asking.
 *
 * So the panel names all three and says how each was counted, and it does the same for the npm
 * cache, where the honest total is roughly 800 MB rather than the 164 MiB of tarballs on disk: the
 * cached packument *documents* live in the database and outweigh the tarballs they index by about
 * 3.8×. And it reports the orphaned bytes, which are invisible everywhere else in this app by
 * construction — blobs with no manifest and no row, so no table built on rows can show them.
 *
 * Nothing here is summed and nothing is charted. A bar chart of these would draw a comparison
 * between quantities that overlap, which is the exact error the panel is built to prevent.
 *
 * The "how these are counted" disclosure is a **local signal**, not a URL parameter: opening it
 * costs no request, so there is nothing to restore and nothing to share.
 */
@Component({
  selector: 'app-store-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, QitsCard],
  template: `
    <qits-card heading="What the store holds" subheading="Three OCI figures, and none of them add">
      <app-async
        [state]="state()"
        loadingLabel="Measuring the store"
        errorLabel="Could not measure the store"
        (retry)="reload.emit()"
      />

      @if (state(); as loaded) {
        @if (loaded.kind === 'ready') {
          @for (group of groups(); track group.title) {
            <section class="group">
              <h3>{{ group.title }}</h3>
              <dl>
                @for (figure of group.figures; track figure.label) {
                  <div class="figure">
                    <dt>{{ figure.label }}</dt>
                    <dd class="value">{{ figure.value }}</dd>
                    @if (explained()) {
                      <dd class="kind">{{ figure.kind }}</dd>
                    }
                  </div>
                }
              </dl>
            </section>
          }

          <button
            type="button"
            class="disclosure"
            [attr.aria-expanded]="explained()"
            (click)="toggle()"
          >
            <span class="chevron" aria-hidden="true"></span>
            <span>{{ explained() ? 'Hide' : 'Show' }} how each of these was counted</span>
          </button>

          <p class="note">
            These figures describe one store and they do not sum. Blobs are content-addressed and
            deduplicated across every repository, so the same layer can be referenced by ten
            manifests and is on disk once. Where a size is shown elsewhere in this app it is a
            <strong>union</strong> over the thing being shown, and it is labelled as one.
          </p>
        }
      }
    </qits-card>
  `,
  styleUrl: '../ui/page.css',
  styles: `
    .group + .group {
      margin-top: 0.9rem;
    }

    h3 {
      margin: 0 0 0.35rem;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 600;
    }

    dl {
      margin: 0;
    }

    .figure {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: baseline;
      gap: 0 0.75rem;
      padding: 0.2rem 0;
      border-bottom: 1px solid #f3f4f6;
    }

    dt {
      min-width: 0;
    }

    dd {
      margin: 0;
    }

    .value {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .kind {
      grid-column: 1 / -1;
      color: #6b7280;
      font-size: 0.85rem;
    }
  `,
})
export class StoreSummary {
  readonly state = input.required<Loadable<StoreSummaryDto>>();

  /** Read the store's figures again. */
  readonly reload = output<void>();

  protected readonly explained = signal(false);

  protected toggle(): void {
    this.explained.update((shown) => !shown);
  }

  protected readonly groups = computed<readonly Group[]>(() => {
    const state = this.state();
    if (state.kind !== 'ready') {
      return [];
    }
    const summary = state.value;
    return [
      {
        title: 'Container images',
        figures: [
          {
            label: 'Per-image unions, added up',
            value: formatBytes(summary.ociPerImageSumBytes),
            kind:
              'Each image counted as the set of blobs its manifests reference, then those totals ' +
              'added. This is what the images table would total to. It over-counts the handful of ' +
              'blobs that two images share.',
          },
          {
            label: 'True union, counted once',
            value: formatBytes(summary.ociUnionBytes),
            kind: 'Every distinct blob any OCI manifest references, counted exactly once. The only figure here that is a fact about the disk rather than about a view of it.',
          },
          {
            label: 'Orphaned blobs',
            value: formatBytes(summary.orphanBytes),
            kind:
              'Bytes reachable from no manifest, no tag and no database row — uploaded through a ' +
              'blob session that never got a manifest. Nothing else in this explorer can show ' +
              'them, and there is no garbage collector to reclaim them.',
          },
        ],
      },
      {
        title: 'npm',
        figures: [
          {
            label: 'Published tarballs',
            value: formatBytes(summary.npmPublishedBytes),
            kind: 'The tarballs of packages published to this platform, on disk.',
          },
          {
            label: 'Cached tarballs, from npmjs',
            value: formatBytes(summary.npmProxyTarballBytes),
            kind: 'Upstream tarballs the proxy has actually pulled, on disk. A package whose document was fetched but whose tarball was not is absent from this figure and from the package listing.',
          },
          {
            label: 'Cached packument documents',
            value: formatBytes(summary.npmProxyPackumentBytes),
            kind:
              'The upstream metadata documents behind the cache. They live in the database, not ' +
              'the blob store, and they outweigh the tarballs they index by roughly four to one — ' +
              'a cache figure that leaves them out is the wrong answer by nearly 4×.',
          },
        ],
      },
      {
        title: 'Disk',
        figures: [
          {
            label: 'Blob volume, total',
            value: formatBytes(summary.diskTotalBytes),
            kind: 'What the volume holds: every blob file, whatever references it. Larger than any single union above, because it carries the npm tarballs and the orphans alongside the OCI content.',
          },
        ],
      },
    ];
  });
}
