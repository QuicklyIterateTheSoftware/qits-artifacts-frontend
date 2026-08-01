import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Something that loaded and holds nothing, said in a sentence.
 *
 * It exists so that "this repository has no images" and "the golden-diff loop has never produced
 * anything" are drawn the same way and are never drawn as blank space — an empty table that renders
 * nothing is indistinguishable from one that failed silently.
 */
@Component({
  selector: 'app-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="empty">{{ message() }}</p>`,
  styles: `
    .empty {
      margin: 0.15rem 0;
      color: #6b7280;
      font-style: italic;
    }
  `,
})
export class Empty {
  readonly message = input.required<string>();
}
