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

/** A person renamed on both sides: one conflict in the banner, nothing written yet. */
async function conflicted() {
  const fake = fakeGithub();
  const { repo } = await open(fake, { people: [person('p1', 'Base')] });
  fake.seed('people.json', [person('p1', 'Theirs')]);
  repo.updatePerson('p1', { name: 'Mine' });
  await repo.flushPending();
  renderBanner(repo);
  return { fake, repo };
}

describe('Conflict banner (§3 Conflict edge cases)', () => {
  it('names the person and the field, with both values in words', async () => {
    await conflicted();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Changed by someone else while you were editing. Choose which value to keep.');
    expect(alert.textContent).toContain('Theirs · Name — yours Mine, theirs Theirs');
  });

  it('names the initiative, the phase field and both dates as the date field shows them, not as JSON', async () => {
    const fake = fakeGithub();
    const plan = { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [] };
    const { repo } = await open(fake, { initiatives: [initiative({ phases: { validation: plan } })] });
    fake.seed('initiatives/i1.json', initiative({ phases: { validation: { ...plan, endDate: '2026-12-15' } } }));
    repo.setPhaseDate('i1', 'validation', 'endDate', '2026-12-01');
    await repo.flushPending();
    renderBanner(repo);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Payments API · Validation end date — yours 01.12.2026, theirs 15.12.2026');
    expect(alert.textContent).not.toMatch(/[{}"]/);
  });

  it('a choice whose write failed stays, names the cause, and choosing again is the retry', async () => {
    const user = userEvent.setup();
    const { fake } = await conflicted();
    fake.fail('people.json', 403);

    await user.click(await screen.findByRole('button', { name: 'Use mine' }));

    expect(await screen.findByText(/Your choice was not saved: .*\. Choose again to retry\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use mine' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Use mine' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fake.read<{ name: string }[]>('people.json')[0].name).toBe('Mine');
  });

  it('a saved choice leaves the banner without a failure line', async () => {
    const user = userEvent.setup();
    await conflicted();

    await user.click(await screen.findByRole('button', { name: 'Keep theirs' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByText(/not saved/)).toBeNull();
  });
});
