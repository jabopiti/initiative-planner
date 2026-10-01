import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryContext } from '../state/DataContext';
import type { Repository } from '../sync/Repository';
import { fakeGithub, initiative, open, person } from '../sync/testing/fakeGithub';
import { ConflictBanner } from './ConflictBanner';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBanner(repo: Repository) {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <RepositoryContext.Provider value={repo}>
        <ConflictBanner />
      </RepositoryContext.Provider>
    </BrandProvider>,
  );
}

/** An initiative's owner changed on both sides: a select, so the banner resolves it itself (§9.9). */
async function conflicted() {
  const fake = fakeGithub();
  const people = [person('p1', 'Mara Voss'), person('p2', 'Jonas Keller')];
  const { repo } = await open(fake, { people, initiatives: [initiative()] });
  fake.seed('initiatives/i1.json', initiative({ ownerId: 'p2' }));
  repo.setOwner('i1', 'p1');
  await repo.flushPending();
  renderBanner(repo);
  return { fake, repo };
}

describe('Conflict banner (§3 Conflict edge cases, §9.9)', () => {
  it('resolves a conflict no text field shows, naming the initiative, the field and both values in words', async () => {
    await conflicted();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Changed by someone else while you were editing. Choose which value to keep.');
    expect(alert.textContent).toContain('Payments API · Owner — yours Mara Voss, theirs Jonas Keller');
    expect(alert.textContent).not.toMatch(/[{}"]/);
  });

  it('points to a conflict whose field is not on screen, and Show goes to its page', async () => {
    const user = userEvent.setup();
    const fake = fakeGithub();
    const plan = { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [] };
    const { repo } = await open(fake, { initiatives: [initiative({ phases: { validation: plan } })] });
    fake.seed('initiatives/i1.json', initiative({ phases: { validation: { ...plan, endDate: '2026-12-15' } } }));
    repo.setPhaseDate('i1', 'validation', 'endDate', '2026-12-01');
    await repo.flushPending();
    renderBanner(repo);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('1 unresolved change on Payments API — Show');
    expect(screen.queryByRole('button', { name: 'Keep theirs' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show 1 unresolved change on Payments API' }));
    expect(window.location.hash).toBe('#/initiatives/i1');
  });

  it('a choice whose write failed stays, names the cause, and choosing again is the retry', async () => {
    const user = userEvent.setup();
    const { fake } = await conflicted();
    fake.fail('initiatives/i1.json', 403);

    await user.click(await screen.findByRole('button', { name: 'Use mine' }));

    expect(await screen.findByText(/Your choice was not saved: .*\. Choose again to retry\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use mine' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Use mine' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fake.read<{ ownerId: string }>('initiatives/i1.json').ownerId).toBe('p1');
  });

  it('a saved choice leaves the banner without a failure line', async () => {
    const user = userEvent.setup();
    await conflicted();

    await user.click(await screen.findByRole('button', { name: 'Keep theirs' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByText(/not saved/)).toBeNull();
  });
});
