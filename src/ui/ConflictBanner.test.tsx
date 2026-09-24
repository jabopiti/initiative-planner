import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryContext } from '../state/DataContext';
import { fakeGithub, open, person } from '../sync/testing/fakeGithub';
import { ConflictBanner } from './ConflictBanner';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A person renamed on both sides: one conflict in the banner, nothing written yet. */
async function conflicted() {
  const fake = fakeGithub();
  const { repo } = await open(fake, { people: [person('p1', 'Base')] });
  fake.seed('people.json', [person('p1', 'Theirs')]);
  repo.updatePerson('p1', { name: 'Mine' });
  await repo.flushPending();
  render(
    <RepositoryContext.Provider value={repo}>
      <ConflictBanner />
    </RepositoryContext.Provider>,
  );
  return { fake, repo };
}

describe('Conflict banner (§3 Conflict edge cases)', () => {
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
