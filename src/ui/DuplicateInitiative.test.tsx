import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Initiative } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { fakeGithub, person, seedDataset, type Fake } from '../sync/testing/fakeGithub';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('sonner', async (original) => ({ ...(await original<object>()), toast: Object.assign(toast, { success: vi.fn(), error: vi.fn() }) }));

/** Slice 025: Duplicate in the Actions menu (§5.4, §5.11). */

const original = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'i1',
  name: 'Checkout Redesign',
  teamId: 't1',
  status: 'Active',
  phases: { validation: { startDate: '2026-01-01', endDate: '2026-03-31', allocations: [{ id: 'a1', personId: 'lucia', allocationPct: 40 }] } },
  ...overrides,
});

let fake: Fake;

const renderPage = (initiative: Initiative) => {
  fake = fakeGithub();
  seedDataset(fake, { teams: [{ id: 't1', name: 'Platform', active: true }], people: [person('lucia', 'Lucía Ramos')], initiatives: [initiative], ratesReviewed: true });
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

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  toast.mockReset();
  window.location.hash = '#/initiatives/i1';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Duplicate in the Actions menu (§5.4, §5.11)', () => {
  it.each(['Active', 'On Hold', 'Closed', 'Cancelled'] as const)('is listed for a %s initiative, before Cancel initiative', async (status) => {
    const user = userEvent.setup();
    renderPage(original({ status }));
    await user.click(await screen.findByRole('button', { name: 'Actions' }));

    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toContain('Duplicate');
    if (status === 'Active' || status === 'On Hold') expect(items.indexOf('Duplicate')).toBeLessThan(items.indexOf('Cancel initiative'));
  });

  it('opens the copy in place as a new history entry, and names who was left out', async () => {
    const user = userEvent.setup();
    renderPage(original({ status: 'Closed' }));
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

    await waitFor(() => expect(window.location.hash).not.toBe('#/initiatives/i1'));
    expect(window.location.hash).toMatch(/^#\/initiatives\/.+/);
    expect(toast).toHaveBeenCalledWith('Not copied: Lucía Ramos, no longer on Platform.');
    const [commit] = fake.puts.filter((p) => p.path !== 'initiatives/i1.json');
    expect(commit.message).toBe(`Checkout Redesign copy: created from Checkout Redesign\n\nEntity: initiative/${window.location.hash.slice('#/initiatives/'.length)}`);
  });

  it('shows no toast when nobody was left out', async () => {
    const user = userEvent.setup();
    renderPage(original({ phases: undefined }));
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

    await waitFor(() => expect(window.location.hash).not.toBe('#/initiatives/i1'));
    expect(toast).not.toHaveBeenCalled();
  });
});
