import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReadOnlyState } from '../github/errors';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SyncIndicator } from './SyncIndicator';

const renderIndicator = () => render(<TooltipProvider><SyncIndicator /></TooltipProvider>);

const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../state/DataContext', () => ({ useRepositoryState: () => state.current }));

afterEach(cleanup);

describe('Sync indicator (§5.1)', () => {
  it('shows the short cause beside "Read-only", in the Warning colour, not Alarm', () => {
    const readOnly: ReadOnlyState = { cause: 'unreachable', message: 'Cannot reach GitHub; changes are paused.' };
    state.current = { readOnly, syncing: false, updatedByOthers: false };
    renderIndicator();
    const label = screen.getByText('Read-only · Cannot reach GitHub');
    expect(label).toHaveClass('text-warning-text');
    expect(label).not.toHaveClass('text-alarm-text');
  });

  it('names the synced icon, and says when others updated', () => {
    state.current = { readOnly: null, syncing: false, updatedByOthers: false };
    const { rerender } = renderIndicator();
    expect(screen.getByRole('img', { name: 'Synced' })).toBeInTheDocument();
    state.current = { readOnly: null, syncing: false, updatedByOthers: true };
    rerender(<TooltipProvider><SyncIndicator /></TooltipProvider>);
    expect(screen.getByRole('img', { name: 'Synced, updated by others' })).toBeInTheDocument();
  });

  it('says "Saved" on focus, and "Saving…" while writes are pending', async () => {
    state.current = { readOnly: null, syncing: false, updatedByOthers: false };
    const { rerender } = renderIndicator();
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Saved');
    state.current = { readOnly: null, syncing: true, updatedByOthers: false };
    rerender(<TooltipProvider><SyncIndicator /></TooltipProvider>);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
  });
});
