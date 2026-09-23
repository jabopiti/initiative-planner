import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useBrand } from './BrandContext';
import { Repository, type RepositoryState } from '../sync/Repository';

const RepositoryContext = createContext<Repository | null>(null);

export function RepositoryProvider({ token, children }: { token: string; children: ReactNode }) {
  const brand = useBrand();
  const repository = useMemo(() => new Repository(brand, token), [brand, token]);

  useEffect(() => {
    void repository.initialize();
  }, [repository]);

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
  return useSyncExternalStore(
    (listener) => repository.subscribe(listener),
    () => repository.getState(),
  );
}

export function useRepository(): Repository {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('useRepository must be used within a RepositoryProvider');
  return repository;
}
