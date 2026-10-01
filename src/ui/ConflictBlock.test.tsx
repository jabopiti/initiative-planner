import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import { FILE_PATHS, type Initiative } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { ConflictUiProvider, useConflictUi, useFieldConflict } from '../state/ConflictUi';
import { RepositoryContext, useFieldFailure, useRepository, useRepositoryState } from '../state/DataContext';
import type { Repository } from '../sync/Repository';
import { fakeGithub, initiative, open, person } from '../sync/testing/fakeGithub';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommitInput } from './CommitInput';
import { CommitTextarea } from './CommitTextarea';
import { ConflictBanner } from './ConflictBanner';
import { InitiativeDetail } from './InitiativeDetail';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const file = FILE_PATHS.initiative('i1');

/** The initiative's name and description, as the header edits them, with their conflicts wired in. */
function Fields() {
  const repository = useRepository();
  const conflict = useFieldConflict();
  const failure = useFieldFailure();
  const { initiatives } = useRepositoryState();
  const i = initiatives[0];
  return (
    <>
      <CommitInput
        aria-label="Initiative name"
        value={i.name}
        conflict={conflict(file, ['name'])}
        failure={failure(file, ['name'])}
        onCommit={(text) => repository.renameInitiative('i1', text)}
      />
      <CommitTextarea
        aria-label="Description"
        value={i.description ?? ''}
        conflict={conflict(file, ['description'])}
        failure={failure(file, ['description'])}
        onCommit={(text) => repository.setDescription('i1', text)}
      />
    </>
  );
}

function ui(repo: Repository, fields: boolean) {
  return (
    <BrandProvider brand={defaultBrandPack}>
      <RepositoryContext.Provider value={repo}>
        <ConflictUiProvider>
          <ConflictBanner />
          {fields && <Fields />}
        </ConflictUiProvider>
      </RepositoryContext.Provider>
    </BrandProvider>
  );
}

/** The name changed on both sides (and the description too, when `both`): conflicts, nothing written yet. */
async function conflicted({ both = false } = {}) {
  const fake = fakeGithub();
  const base = initiative({ description: 'Base text' });
  const { repo } = await open(fake, { initiatives: [base] });
  fake.seed(file, { ...base, name: 'Payments Platform', ...(both ? { description: 'Their text' } : {}) });
  repo.renameInitiative('i1', 'Payments Core');
  if (both) repo.setDescription('i1', 'My text');
  await repo.flushPending();
  const view = render(ui(repo, true));
  return { fake, repo, view };
}

describe('Same-field conflict inline under the field (§3, §9.9)', () => {
  it('shows both values and the two choices under the field, with no banner for it', async () => {
    await conflicted();
    const block = await screen.findByRole('alert');
    expect(block.textContent).toContain('Changed by someone else while you were editing. Theirs: Payments Platform · Yours: Payments Core');
    expect(within(block).getByRole('button', { name: 'Keep theirs for Initiative name' })).toBeTruthy();
    expect(within(block).getByRole('button', { name: 'Use mine for Initiative name' })).toBeTruthy();
    expect(screen.queryByText(/unresolved change/)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Initiative name' }).getAttribute('aria-describedby')).toBe(block.id);
  });

  it('saves the choice and the block goes', async () => {
    const user = userEvent.setup();
    const { fake } = await conflicted();
    await user.click(await screen.findByRole('button', { name: 'Use mine for Initiative name' }));
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fake.read<Initiative>(file).name).toBe('Payments Core');
  });

  it('keeps the block with the cause when the save fails, and never a "Not saved" on the same field', async () => {
    const user = userEvent.setup();
    const { fake } = await conflicted();
    fake.fail(file, 403);
    await user.click(await screen.findByRole('button', { name: 'Use mine for Initiative name' }));
    expect(await screen.findByText(/Your choice was not saved: .*\. Choose again to retry\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep theirs for Initiative name' })).toBeTruthy();
    expect(screen.queryByText(/^Not saved/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('moves to the banner as a pointer once the field is not on screen', async () => {
    const { repo, view } = await conflicted();
    await screen.findByRole('button', { name: 'Keep theirs for Initiative name' });
    view.rerender(ui(repo, false));
    expect((await screen.findByRole('alert')).textContent).toBe('1 unresolved change on Payments Platform — Show');
  });

  it('gives two blocks on one screen their own announced alert and their own accessible names', async () => {
    await conflicted({ both: true });
    const blocks = await screen.findAllByRole('alert');
    expect(blocks).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Keep theirs for Initiative name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep theirs for Description' })).toBeTruthy();
  });

  it('goes when another user\'s change settles it: the repository now holds mine', async () => {
    const { fake, repo } = await conflicted();
    await screen.findByRole('alert');
    fake.seed(file, { ...fake.read<Initiative>(file), name: 'Payments Core' });
    await act(() => repo.pull());
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Initiative name' }).value).toBe('Payments Core');
  });

  it('a new value typed into the field settles it', async () => {
    const user = userEvent.setup();
    const { fake, repo } = await conflicted();
    await screen.findByRole('alert');
    const field = screen.getByRole('textbox', { name: 'Initiative name' });
    await user.clear(field);
    await user.type(field, 'Payments Hub{Enter}');
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await act(() => repo.flushPending());
    expect(fake.read<Initiative>(file).name).toBe('Payments Hub');
  });
});

/** Asks Show's way to the name conflict, and says where Show is still headed. */
function RevealProbe() {
  const { store, reveal } = useConflictUi();
  return (
    <>
      <button type="button" onClick={() => store.reveal({ file, path: ['name'] })}>
        Reveal name
      </button>
      <output aria-label="Reveal">{reveal ? 'pending' : 'none'}</output>
    </>
  );
}

describe('In a table, and reached from the banner (§9.9)', () => {
  it('drops Show\'s target once a pull settles its conflict before the field is on screen', async () => {
    const user = userEvent.setup();
    const fake = fakeGithub();
    const { repo } = await open(fake, { initiatives: [initiative()] });
    fake.seed(file, initiative({ name: 'Payments Platform' }));
    repo.renameInitiative('i1', 'Payments Core');
    await repo.flushPending();
    render(
      <BrandProvider brand={defaultBrandPack}>
        <RepositoryContext.Provider value={repo}>
          <ConflictUiProvider>
            <RevealProbe />
          </ConflictUiProvider>
        </RepositoryContext.Provider>
      </BrandProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Reveal name' }));
    expect(screen.getByRole('status', { name: 'Reveal' }).textContent).toBe('pending');
    fake.seed(file, { ...fake.read<Initiative>(file), name: 'Payments Core' });
    await act(() => repo.pull());
    await vi.waitFor(() => expect(screen.getByRole('status', { name: 'Reveal' }).textContent).toBe('none'));
  });

  it('Show opens the collapsed phase, and the allocation conflict sits in a row under its row, focused on Keep theirs', async () => {
    Element.prototype.scrollIntoView = () => {};
    const user = userEvent.setup();
    const fake = fakeGithub();
    const plan = { startDate: '2026-10-01', endDate: '2026-12-31', allocations: [{ id: 'a1', personId: 'p1', allocationPct: 50 }] };
    const base = initiative({ phases: { development: plan } });
    const { repo } = await open(fake, { people: [person('p1', 'Felix Brandt')], initiatives: [base] });
    fake.seed(file, initiative({ phases: { development: { ...plan, allocations: [{ ...plan.allocations[0], allocationPct: 60 }] } } }));
    repo.updateAllocation('i1', 'development', 'a1', 80);
    await repo.flushPending();
    render(
      <BrandProvider brand={defaultBrandPack}>
        <RepositoryContext.Provider value={repo}>
          <TooltipProvider>
            <ConflictUiProvider>
              <ConflictBanner />
              <InitiativeDetail id="i1" />
            </ConflictUiProvider>
          </TooltipProvider>
        </RepositoryContext.Provider>
      </BrandProvider>,
    );

    expect((await screen.findByRole('alert')).textContent).toBe('1 unresolved change on Payments API — Show');
    await user.click(screen.getByRole('button', { name: 'Show 1 unresolved change on Payments API' }));

    const keep = await screen.findByRole('button', { name: 'Keep theirs for Allocation % for Felix Brandt' });
    const block = keep.closest('[role="alert"]') as HTMLElement;
    expect(block.textContent).toContain('Theirs: 60% · Yours: 80%');
    expect(block.closest('td')?.colSpan).toBe(5);
    expect(screen.getByRole('spinbutton', { name: 'Allocation % for Felix Brandt' }).closest('td')?.contains(block)).toBe(false);
    await vi.waitFor(() => expect(document.activeElement).toBe(keep));
    expect(screen.queryByText(/unresolved change/)).toBeNull();
  });
});
