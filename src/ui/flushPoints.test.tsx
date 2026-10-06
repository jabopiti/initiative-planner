import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider, useRepository } from '../state/DataContext';
import { COMMIT_QUIET_MS } from '../sync/FileWriter';
import { withRealCommitWindow } from '../sync/testing/clock';
import type { Repository } from '../sync/Repository';
import { fakeGithub, initiative, seedDataset, type Fake } from '../sync/testing/fakeGithub';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InitiativeDetail } from './InitiativeDetail';

/** Slice 064 item 1 (§10.3): pending edits are sent at once, not at the end of the 4 s window, when the page is left. */

let fake: Fake;
let repository: Repository;

function Capture() {
  repository = useRepository();
  return null;
}

async function renderApp(page: React.ReactNode) {
  const view = render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">
          <Capture />
          {page}
        </RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
  await vi.waitFor(() => expect(repository.getState().initiatives).toHaveLength(1));
  return view;
}

const commits = () => fake.commits('initiatives/i1.json');

withRealCommitWindow();

beforeEach(() => {
  fake = fakeGithub();
  seedDataset(fake, { initiatives: [initiative()] });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.unstubAllGlobals();
});

describe('flush points (slice 064, §10.3)', () => {
  it('leaving the initiative sends its pending edit at once', async () => {
    const { rerender } = await renderApp(<InitiativeDetail id="i1" />);
    await screen.findByLabelText('Initiative name');
    act(() => void repository.renameInitiative('i1', 'Payments API v2'));
    expect(commits()).toHaveLength(0);

    rerender(
      <BrandProvider brand={defaultBrandPack}>
        <TooltipProvider>
          <RepositoryProvider token="token">
            <Capture />
          </RepositoryProvider>
        </TooltipProvider>
      </BrandProvider>,
    );

    await vi.waitFor(() => expect(commits()).toHaveLength(1), { timeout: COMMIT_QUIET_MS / 2 });
    expect(commits()[0].content).toMatchObject({ name: 'Payments API v2' });
  });

  it('hiding the tab sends every pending edit at once', async () => {
    await renderApp(null);
    act(() => void repository.renameInitiative('i1', 'Hidden'));

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(() => expect(commits()).toHaveLength(1), { timeout: COMMIT_QUIET_MS / 2 });
  });

  it('pagehide sends every pending edit at once', async () => {
    await renderApp(null);
    act(() => void repository.renameInitiative('i1', 'Closing'));

    window.dispatchEvent(new Event('pagehide'));

    await vi.waitFor(() => expect(commits()).toHaveLength(1), { timeout: COMMIT_QUIET_MS / 2 });
  });
});
