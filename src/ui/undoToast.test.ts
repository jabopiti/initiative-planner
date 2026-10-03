import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Repository } from '../sync/Repository';
import { undoToast } from './undoToast';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'toast-1'), { dismiss: vi.fn() }) }));

type Options = { action: { onClick: () => void }; onDismiss: () => void; onAutoClose: () => void };

describe('undoToast (§5.11)', () => {
  const unsubscribe = vi.fn();
  const repository = { subscribe: vi.fn(() => unsubscribe), getState: () => ({ initiatives: [] }) } as unknown as Repository;
  const options = () => vi.mocked(toast).mock.calls[0][1] as unknown as Options;

  beforeEach(() => vi.clearAllMocks());

  it('stops watching the repository once Undo is clicked, which closes the toast without onDismiss', () => {
    const undo = vi.fn();
    undoToast(undo, { repository, initiativeId: 'i1', phaseId: 'validation' });
    options().action.onClick();
    expect(undo).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it.each(['onDismiss', 'onAutoClose'] as const)('stops watching the repository on %s', (close) => {
    undoToast(vi.fn(), { repository, initiativeId: 'i1', phaseId: 'validation' });
    options()[close]();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
