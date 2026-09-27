import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitInput } from './CommitInput';

afterEach(cleanup);

describe('a failed edit stays in edit (§3, §9.9)', () => {
  it('shows the cause and a Retry button with its own accessible name, and Retry calls back', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(
      <CommitInput
        aria-label="Team FTE %"
        value="80"
        onCommit={() => {}}
        failure={{ message: 'Not saved: Cannot reach GitHub; changes are paused.', retry }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Not saved: Cannot reach GitHub; changes are paused.');
    const retryButton = screen.getByRole('button', { name: 'Retry saving Team FTE %' });
    await user.click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);
    // The field keeps its value; it never looks like it reset.
    expect(screen.getByRole('textbox', { name: 'Team FTE %' })).toHaveValue('80');
  });

  it('does not show the failed message while a different, uncommitted edit is being typed', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<CommitInput aria-label="Team FTE %" value="80" onCommit={() => {}} failure={{ message: 'Not saved: offline.', retry }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Team FTE %' }), '5');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses an explicit retryLabel over the derived one, when given', () => {
    render(
      <CommitInput
        aria-label="Amount for Design"
        value="100"
        onCommit={() => {}}
        failure={{ message: 'Not saved: offline.', retry: () => {} }}
        retryLabel="Retry saving Design's amount"
      />,
    );
    expect(screen.getByRole('button', { name: "Retry saving Design's amount" })).toBeInTheDocument();
  });

  it('shows nothing extra once failure is cleared (a fresh commit landed)', () => {
    const { rerender } = render(
      <CommitInput aria-label="Team FTE %" value="80" onCommit={() => {}} failure={{ message: 'Not saved: offline.', retry: () => {} }} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<CommitInput aria-label="Team FTE %" value="80" onCommit={() => {}} failure={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
