import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CopyButton } from './CopyButton';

vi.mock('./copyTable', () => ({ copyTable: vi.fn() }));
import { copyTable } from './copyTable';

afterEach(cleanup);

describe('Copy button (§9.2, §9.9)', () => {
  const data = { header: ['Name'], rows: [['A'], ['B'], ['C']] } as never;
  const setup = () =>
    render(
      <TooltipProvider>
        <CopyButton getData={() => data} noun={['team', 'teams']} />
      </TooltipProvider>,
    );

  it('confirms in text beside the button, not in a toast', async () => {
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copied 3 teams');
  });

  it('says so beside the button when the clipboard is blocked', async () => {
    vi.mocked(copyTable).mockRejectedValueOnce(new Error('blocked'));
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't copy. Your browser blocked clipboard access.");
  });
});
