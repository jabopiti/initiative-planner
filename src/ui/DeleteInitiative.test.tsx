import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import type { GateRecord, Initiative } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { fakeGithub, seedDataset, type Fake } from '../sync/testing/fakeGithub';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../router/useHashRoute', async (original) => ({ ...(await original<object>()), navigate }));

/** Slice 017: Delete in the Actions menu, its inline confirmation, and the page after someone else deleted it. */

const PATH = 'initiatives/i1.json';
const [discovery] = defaultBrandPack.process;
const passed: GateRecord = { outcome: 'passed', passedOn: '2026-09-01', checklist: [] };
const skipped: GateRecord = { outcome: 'skipped', skipReason: 'Known work', checklist: [] };
const copy = (overrides: Partial<Initiative> = {}): Initiative => ({ id: 'i1', name: 'Checkout Redesign copy', teamId: 't1', status: 'Active', ...overrides });

let fake: Fake;

const renderPage = (initiative: Initiative) => {
  fake = fakeGithub();
  seedDataset(fake, { teams: [{ id: 't1', name: 'Platform', active: true }], initiatives: [initiative], ratesReviewed: true });
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <InitiativeDetail id="i1" />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
};

async function openConfirmation() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Actions' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  return { user, dialog: screen.getByRole('alertdialog') };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  navigate.mockReset().mockImplementation((path: string) => {
    window.location.hash = path;
  });
  window.location.hash = '#/initiatives/i1';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Delete in the Actions menu (§5.4, §9.3)', () => {
  it('is listed last, after a separator, in the destructive style, while no gate was passed', async () => {
    const user = userEvent.setup();
    renderPage(copy());
    await user.click(await screen.findByRole('button', { name: 'Actions' }));

    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Put on hold', 'Duplicate', 'Cancel initiative', 'Delete']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('data-variant', 'destructive');
  });

  it('is listed when the only gate record is skipped, also for a Cancelled initiative', async () => {
    const user = userEvent.setup();
    renderPage(copy({ status: 'Cancelled', gates: { [discovery.id]: skipped } }));
    await user.click(await screen.findByRole('button', { name: 'Actions' }));

    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('is not listed once a gate was passed', async () => {
    const user = userEvent.setup();
    renderPage(copy({ gates: { [discovery.id]: passed } }));
    await user.click(await screen.findByRole('button', { name: 'Actions' }));

    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
  });
});

describe('The delete confirmation (§9.9)', () => {
  it('asks under the header with Confirm delete and Cancel, focus on Cancel', async () => {
    renderPage(copy());
    const { dialog } = await openConfirmation();

    expect(within(dialog).getByText('Delete Checkout Redesign copy?')).toBeInTheDocument();
    expect(within(dialog).getByText("This can't be undone.")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('Cancel and Esc close it, delete nothing, and return focus to the Actions button', async () => {
    renderPage(copy());
    const { user, dialog } = await openConfirmation();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();

    await openConfirmation();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
    expect(fake.deletes).toEqual([]);
  });

  it('Confirm delete deletes the file in one commit and replaces the page with the Initiatives table', async () => {
    renderPage(copy());
    const { user, dialog } = await openConfirmation();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/initiatives', { replace: true }));
    expect(fake.deletes).toEqual([expect.objectContaining({ message: expect.stringMatching(/^Checkout Redesign copy: deleted\n\nEntity: initiative\/.+$/), status: 200 })]);
    expect(fake.has(PATH)).toBe(false);
  });

  it('choosing Delete again while it runs keeps it running, with no Cancel offered', async () => {
    renderPage(copy());
    const { user, dialog } = await openConfirmation();
    const release = fake.hold(PATH);
    await user.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    release();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/initiatives', { replace: true }));
  });

  it('says so, with Close, when another user passed a gate meanwhile', async () => {
    renderPage(copy());
    const { user, dialog } = await openConfirmation();
    fake.seed(PATH, copy({ gates: { [discovery.id]: passed } }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));

    expect(await within(dialog).findByText("A gate was passed meanwhile, so Checkout Redesign copy can't be deleted. Cancel it instead.")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(fake.has(PATH)).toBe(true);
  });

  it('keeps the page and shows the cause when GitHub is unreachable; Confirm delete tries again', async () => {
    renderPage(copy());
    const { user, dialog } = await openConfirmation();
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? Promise.reject(new TypeError('Failed to fetch')) : fake.fetchMock(url, init),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));

    expect(await within(dialog).findByText('Not deleted: Cannot reach GitHub; changes are paused.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Confirm delete' })).toBeEnabled();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('Deleted by someone else (§3)', () => {
  it('names the change that was not saved on the not-found page', async () => {
    const user = userEvent.setup();
    renderPage(copy());
    const name = await screen.findByRole('textbox', { name: 'Initiative name' });
    fake.remove(PATH);
    await user.clear(name);
    await user.type(name, 'Checkout Redesign test{Enter}');

    expect(await screen.findByText("This initiative couldn't be found.", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Checkout Redesign test was deleted, so your last change to it wasn't saved.")).toBeInTheDocument();
    expect(fake.has(PATH)).toBe(false);
  });

  it('offers one way back to the Portfolio on the not-found page (§9.4)', async () => {
    const user = userEvent.setup();
    renderPage(copy());
    await screen.findByRole('textbox', { name: 'Initiative name' });
    fake.remove(PATH);
    await user.type(screen.getByRole('textbox', { name: 'Initiative name' }), 'x{Enter}');
    await screen.findByText("This initiative couldn't be found.", {}, { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: 'Back to Portfolio' }));
    expect(window.location.hash).toBe('#/portfolio');
  });
});
