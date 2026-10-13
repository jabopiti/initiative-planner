import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import { buildBaselineDataset } from '../data/baseline';
import { buildExampleData } from '../data/exampleDataset';
import type { RepositoryState } from '../sync/Repository';
import { BrandProvider } from '../state/BrandContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CopyForAiMenu } from './CopyForAiMenu';

let state: Partial<RepositoryState>;
vi.mock('../state/DataContext', () => ({ useRepositoryState: () => state }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

const { roles, countries } = buildBaselineDataset(defaultBrandPack);
const example = buildExampleData(defaultBrandPack, { roles, countries }, new Date(2026, 9, 4));
const checkout = example.initiatives.find((i) => i.name === 'Checkout Redesign')!;

function show() {
  state = { ...example, roles, countries };
  render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <CopyForAiMenu initiative={checkout} />
      </TooltipProvider>
    </BrandProvider>,
  );
}

async function choose(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click(screen.getByRole('button', { name: 'Copy for AI' }));
  await user.click(await screen.findByRole(item === 'Include names' ? 'menuitemcheckbox' : 'menuitem', { name: item }));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Copy for AI (§9.12)', () => {
  it('copies the initiative as a prompt, by role, and confirms in a toast', async () => {
    const user = userEvent.setup();
    show();
    await choose(user, 'Copy for AI');
    const text = await navigator.clipboard.readText();
    expect(text).toContain('## Initiative: Checkout Redesign');
    expect(text).toContain('- Owner: Product Manager');
    expect(text).not.toContain('Mara Voss');
    expect(toast.success).toHaveBeenCalledWith('Copied Checkout Redesign for AI');
    // Focus goes back to the button without opening its tooltip.
    expect(screen.getByRole('button', { name: 'Copy for AI' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('offers Include names, off by default, and remembers it in this browser', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Copy for AI' }));
    const option = await screen.findByRole('menuitemcheckbox', { name: 'Include names' });
    expect(option).toHaveAttribute('aria-checked', 'false');
    await user.click(option);
    expect(option).toHaveAttribute('aria-checked', 'true'); // the menu stays open
    await user.click(screen.getByRole('menuitem', { name: 'Copy for AI' }));
    expect(await navigator.clipboard.readText()).toContain('- Owner: Mara Voss (Product Manager)');

    // A reload in the same browser keeps the choice.
    cleanup();
    show();
    await user.click(screen.getByRole('button', { name: 'Copy for AI' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Include names' })).toHaveAttribute('aria-checked', 'true');
  });

  it('says so in a toast when the clipboard refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('blocked'));
    show();
    await choose(user, 'Copy for AI');
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't copy. Your browser blocked clipboard access."));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('still copies a Cancelled initiative, saying it has no current gate', async () => {
    const user = userEvent.setup();
    state = { ...example, roles, countries };
    render(
      <BrandProvider brand={defaultBrandPack}>
        <TooltipProvider>
          <CopyForAiMenu initiative={{ ...checkout, status: 'Cancelled' }} />
        </TooltipProvider>
      </BrandProvider>,
    );
    await choose(user, 'Copy for AI');
    expect(await navigator.clipboard.readText()).toContain('There is no current gate: the initiative is Cancelled.');
  });
});
