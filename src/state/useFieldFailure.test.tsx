import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import { FILE_PATHS } from '../data/types';
import { fakeGithub, open, person } from '../sync/testing/fakeGithub';
import { BrandProvider } from './BrandContext';
import { RepositoryContext, useFieldFailure } from './DataContext';
import type { Repository } from '../sync/Repository';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Renders what `useFieldFailure()` says for one path, as plain text, so a test can assert on it directly. */
function Probe({ file, path }: { file: string; path: (string | { id: string })[] }) {
  const failure = useFieldFailure();
  const result = failure(file, path);
  return <div data-testid="probe">{result ? result.message : 'none'}</div>;
}

function renderProbe(repo: Repository, file: string, path: (string | { id: string })[]) {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <RepositoryContext.Provider value={repo}>
        <Probe file={file} path={path} />
      </RepositoryContext.Provider>
    </BrandProvider>,
  );
}

describe('useFieldFailure (§3, §9.9)', () => {
  it('is null while nothing has failed', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { people: [person('p1', 'Base')] });
    renderProbe(repo, FILE_PATHS.people, [{ id: 'p1' }, 'name']);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it("names the cause once that path's edit has failed to save", async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { people: [person('p1', 'Base')] });
    fake.fail('people.json', 500);
    repo.updatePerson('p1', { name: 'Mine' });
    await repo.flushPending();

    renderProbe(repo, FILE_PATHS.people, [{ id: 'p1' }, 'name']);
    expect(screen.getByTestId('probe')).toHaveTextContent(/^Not saved:/);
  });

  it('is null for a path an open same-field conflict already owns, even when its resolution failed to save', async () => {
    const fake = fakeGithub();
    const { repo } = await open(fake, { people: [person('p1', 'Base')] });
    fake.seed('people.json', [person('p1', 'Theirs')]);
    repo.updatePerson('p1', { name: 'Mine' });
    await repo.flushPending();
    expect(repo.getState().conflicts).toHaveLength(1);

    fake.fail('people.json', 500);
    await repo.resolveConflict(repo.getState().conflicts[0], 'mine').catch(() => undefined);
    expect(repo.getState().conflicts).toHaveLength(1); // still open: the resolution's own write failed
    expect(repo.getState().readOnly).not.toBeNull();

    renderProbe(repo, FILE_PATHS.people, [{ id: 'p1' }, 'name']);
    expect(screen.getByTestId('probe')).toHaveTextContent('none'); // ConflictBanner owns this path's message, not this hook
  });
});
