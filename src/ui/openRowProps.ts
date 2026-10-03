import type { KeyboardEvent } from 'react';

/**
 * Keyboard access for a clickable table row (§9.5): the row takes focus, and Enter or Space on the row itself
 * opens it. A key pressed on a link or button inside the row stays that control's own.
 */
export function openRowProps(open: () => void) {
  return {
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      open();
    },
  };
}
