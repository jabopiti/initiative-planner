import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { causeText } from '../github/errors';
import { pathKey, type Path } from '../sync/merge';
import { useBrand } from './BrandContext';
import { changeCovers, changeKey, Repository, type RateLimit, type RepositoryState } from '../sync/Repository';

export const RepositoryContext = createContext<Repository | null>(null);

export function RepositoryProvider({ token, children }: { token: string; children: ReactNode }) {
  const brand = useBrand();
  const repository = useMemo(() => new Repository(brand, token), [brand, token]);

  useEffect(() => {
    void repository.initialize();
  }, [repository]);

  // §3: pull when the tab regains focus and at least every 5 minutes while it is visible.
  useEffect(() => repository.startPulling(), [repository]);

  // §7.2: a year entering the tracked window gets its rates, by the first client that needs them.
  useEffect(() => repository.keepTrackedYears(), [repository]);

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
    for (const other of changed) if (changeCovers(key, other) || changeCovers(other, key)) return true;
    return false;
  };
}

/** What a failed field shows in place of looking like a normal committed field (§3, §9.9). */
export interface FieldFailure {
  message: string;
  retry: () => void;
}

/**
 * A field's own failed, unsaved edit (§3, §9.9): null once the value at `path` of `file` has nothing failed,
 * or a same-field conflict already owns that path — `ConflictBanner` says so there, so this never says it too.
 * A function rather than a hook per value, so a row of fields can ask inside a loop, like `useIsChangedByOthers`.
 */
export function useFieldFailure(): (file: string, path: Path) => FieldFailure | null {
  const repository = useRepository();
  const { failedFields, fileFailures, conflicts } = useRepositoryState();
  return (file, path) => {
    if (!failedFields.has(changeKey(file, path))) return null;
    if (conflicts.some((c) => c.file === file && pathKey(c.path) === pathKey(path))) return null;
    const cause = fileFailures.get(file);
    if (!cause) return null;
    return { message: `Not saved: ${causeText(cause)}.`, retry: () => repository.retryFile(file) };
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

/** GitHub's request budget as the latest response reported it (§5.9), or null before any response carried it. */
export function useRateLimit(): RateLimit | null {
  const repository = useRepository();
  return useSyncExternalStore(repository.subscribeRateLimit, repository.getRateLimit);
}
