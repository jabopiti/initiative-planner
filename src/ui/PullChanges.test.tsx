import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepository } from '../state/DataContext';
import { CHANGE_TINT_MS } from '../sync/Repository';
import { fakeGithub, initiative, open, type Fake } from '../sync/testing/fakeGithub';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';
import { SyncIndicator } from './SyncIndicator';
import { ConflictBanner } from './ConflictBanner';

/** Lets a test pull without waiting for a focus event or the 5-minute timer. */
let pullNow: () => Promise<void>;
function PullHandle() {
  const repository = useRepository();
  pullNow = () => repository.pull();
  return null;
}

function renderPage() {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <PullHandle />
          <SyncIndicator />
          <ConflictBanner />
          <InitiativeDetail id="i1" />
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

describe('Others’ changes on screen (§3, §9.9)', () => {
  let fake: Fake;

  beforeEach(async () => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.scrollIntoView = () => {};
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    fake = fakeGithub();
    const teams = [
      { id: 'team-1', name: 'Payments', active: true },
      { id: 'team-2', name: 'Platform', active: true },
    ];
    // A first visit fills the browser cache; the page under test then opens from it.
    const { repo } = await open(fake, { teams, initiatives: [initiative()] });
    await repo.whenPulled();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens from the cache: the page shows before the pull answers, and the indicator says "Syncing…" until it does', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => gate.then(() => fake.fetchMock(url, init)));
    renderPage();

    expect(await screen.findByRole('textbox', { name: 'Initiative name' })).toHaveValue('Payments API');
    expect(screen.getByText('Syncing…')).toBeInTheDocument();

    release();
    await vi.waitFor(() => expect(screen.queryByText('Syncing…')).not.toBeInTheDocument());
  });

  it('shows a colleague’s change without a reload, tinted for a few seconds, and the indicator says "Updated by others"', async () => {
    renderPage();
    const name = await screen.findByRole('textbox', { name: 'Initiative name' });
    await vi.waitFor(() => expect(screen.queryByText('Syncing…')).not.toBeInTheDocument());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    fake.seed('initiatives/i1.json', initiative({ name: 'Payments API v2' }));

    await act(() => pullNow());

    expect(name).toHaveValue('Payments API v2');
    expect(name).toHaveClass('bg-met-tint');
    expect(screen.getByTitle('Updated by others')).toBeInTheDocument();

    await act(async () => void vi.advanceTimersByTime(CHANGE_TINT_MS));
    expect(name).not.toHaveClass('bg-met-tint');
    expect(screen.getByTitle('Synced')).toBeInTheDocument();
  });

  it('leaves what is being typed alone, and brings the change in when the field is left', async () => {
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByRole('textbox', { name: 'Initiative name' });
    await vi.waitFor(() => expect(screen.queryByText('Syncing…')).not.toBeInTheDocument());

    await user.click(name);
    await user.type(name, ' EU');
    fake.seed('initiatives/i1.json', initiative({ teamId: 'team-2' }));
    await act(() => pullNow());

    expect(name).toHaveValue('Payments API EU');
    expect(screen.queryByText('Platform')).not.toBeInTheDocument();

    await user.tab();

    expect(await screen.findByText('Platform')).toBeInTheDocument();
    expect(name).toHaveValue('Payments API EU');
  });

  it('a change to the very field being typed is offered as a choice when the field is left, never overwritten silently', async () => {
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByRole('textbox', { name: 'Initiative name' });
    await vi.waitFor(() => expect(screen.queryByText('Syncing…')).not.toBeInTheDocument());

    await user.click(name);
    await user.clear(name);
    await user.type(name, 'Mine');
    fake.seed('initiatives/i1.json', initiative({ name: 'Theirs' }));
    await act(() => pullNow());
    expect(name).toHaveValue('Mine');

    await user.tab();

    const banner = await screen.findByRole('alert');
    expect(within(banner).getByRole('button', { name: /keep theirs/i })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: /use mine/i })).toBeInTheDocument();
  });
});
