import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Repository } from '../sync/Repository';
import { fakeGithub, seedDataset } from '../sync/testing/fakeGithub';
import { BrandProvider } from './BrandContext';
import { RepositoryProvider, useRepository, useRepositoryState } from './DataContext';

afterEach(cleanup);

/** Dispatches the event the way a browser does when the tab is closing and returns whether the page asked to stay. */
function closeTab(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function renderProvider(): Promise<Repository> {
  seedDataset(fakeGithub());
  let repository: Repository | undefined;
  function Capture() {
    repository = useRepository();
    return useRepositoryState().status === 'ready' ? <p>loaded</p> : null;
  }
  const view = render(
    <BrandProvider brand={defaultBrandPack}>
      <RepositoryProvider token="token">
        <Capture />
      </RepositoryProvider>
    </BrandProvider>,
  );
  await waitFor(() => expect(view.getByText('loaded')).toBeInTheDocument());
  return repository!;
}

describe('Closing the tab (§10.3)', () => {
  it('does not stop the tab from closing when nothing is pending', async () => {
    await renderProvider();

    expect(closeTab()).toBe(false);
  });

  it('asks the browser to warn while an edit is pending, and still starts the save', async () => {
    const repository = await renderProvider();
    act(() => {
      repository.createTeam('Platform');
    });

    expect(closeTab()).toBe(true);
    await waitFor(() => expect(repository.hasUnsavedWork()).toBe(false));
    expect(closeTab()).toBe(false);
  });
});

describe('Unmounting the app (§10.3)', () => {
  it('sends a save still waiting on its debounce instead of dropping it', async () => {
    const repository = await renderProvider();
    act(() => {
      repository.createTeam('Platform');
    });
    expect(repository.hasUnsavedWork()).toBe(true);

    cleanup();
    await waitFor(() => expect(repository.hasUnsavedWork()).toBe(false));
  });
});
