import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRowProps } from './openRowProps';

afterEach(cleanup);

describe('a clickable table row (§9.5)', () => {
  function setup() {
    const open = vi.fn();
    render(
      <table>
        <tbody>
          <tr aria-label="Checkout Redesign row" {...openRowProps(open)}>
            <td>
              <a href="#/x">Checkout Redesign</a>
            </td>
          </tr>
        </tbody>
      </table>,
    );
    return open;
  }

  it('takes focus and opens on Enter and on Space', async () => {
    const open = setup();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('row')).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('leaves a key pressed on the link inside it to the link', async () => {
    const open = setup();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(open).not.toHaveBeenCalled();
  });
});
