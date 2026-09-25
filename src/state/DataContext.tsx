import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { Path } from '../sync/merge';
import { useBrand } from './BrandContext';
import { changeCovers, changeKey, Repository, type RepositoryState } from '../sync/Repository';

export const RepositoryContext = createContext<Repository | null>(null);

export function RepositoryProvider({ token, children }: { token: string; children: ReactNode }) {
  const brand = useBrand();
  const repository = useMemo(() => new Repository(brand, token), [brand, token]);

  useEffect(() => {
    void repository.initialize();
  }, [repository]);

  // §3: pull when the tab regains focus and at least every 5 minutes while it is visible.
  useEffect(() => repository.startPulling(), [repository]);

  useEffect(() => {
    const onUnload = () => {
      void repository.flushPending();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [repository]);

  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useRepositoryState(): RepositoryState {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('useRepositoryState must be used within a RepositoryProvider');
  return useSyncExternalStore(repository.subscribe, repository.getState);
}

export function useRepository(): Repository {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('useRepository must be used within a RepositoryProvider');
  return repository;
}

/**
 * Whether the value at `path` of a data-branch file was changed by another user a moment ago, so it is tinted
 * (§9.9 Changed by others). A whole record or list item that is new counts for every value inside it, and a
 * changed value counts for the record around it, so a list row is tinted when any of its values changed.
 * A function rather than a hook per value, so rows of a list can ask inside a loop.
 */
export function useIsChangedByOthers(): (file: string, path: Path) => boolean {
  const { changed } = useRepositoryState();
  return (file, path) => {
    if (changed.size === 0) return false;
    const key = changeKey(file, path);
    return [...changed].some((other) => changeCovers(key, other) || changeCovers(other, key));
  };
}

/**
 * A field with unsaved typing keeps the change another user made from replacing what is being typed (§3): the
 * pull is held while `editing` is true and merged, like a save that found the file changed, once it is not.
 * Without a repository (a field used outside the app) it does nothing.
 */
export function useHoldWhileEditing(editing: boolean): void {
  const repository = useContext(RepositoryContext);
  useEffect(() => {
    if (!repository || !editing) return;
    return repository.holdWhileEditing();
  }, [repository, editing]);
}
