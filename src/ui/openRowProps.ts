import type { KeyboardEvent, MouseEvent } from 'react';

/** Controls inside a row that keep their own click and keys. */
const OWN_CONTROLS = 'a, button, input, select, textarea, [data-row-action]';

/**
 * A clickable table row (§9.5): the click opens it, the row takes focus, and Enter or Space on the row itself opens
 * it. A click or key on a link, button or field inside the row stays that control's own.
 */
export function openRowProps(open: () => void) {
  return {
    tabIndex: 0,
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (!(e.target as HTMLElement).closest(OWN_CONTROLS)) open();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      open();
    },
  };
}
