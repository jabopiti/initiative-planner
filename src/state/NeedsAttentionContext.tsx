import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { localToday } from '../data/dates';
import { needsAttentionItems, type NeedsAttentionItem } from '../data/needsAttention';
import { useBrand } from './BrandContext';
import { useRepositoryState } from './DataContext';

const NeedsAttentionContext = createContext<NeedsAttentionItem[] | null>(null);

/**
 * Computes the Portfolio's Needs attention items (§8.5) once per render, above both the Initiatives nav count
 * (§5.1) and the strip itself, so the two sibling consumers read one list instead of each recomputing it.
 */
export function NeedsAttentionProvider({ children }: { children: ReactNode }) {
  const { process, approvalTracks } = useBrand();
  const { initiatives, people, roles, countries } = useRepositoryState();
  const today = localToday();
  const items = useMemo(
    () => needsAttentionItems(initiatives, process, people, { roles, countries }, approvalTracks, today),
    [initiatives, process, people, roles, countries, approvalTracks, today],
  );
  return <NeedsAttentionContext.Provider value={items}>{children}</NeedsAttentionContext.Provider>;
}

export function useNeedsAttentionItems(): NeedsAttentionItem[] {
  const items = useContext(NeedsAttentionContext);
  if (!items) throw new Error('useNeedsAttentionItems must be used within a NeedsAttentionProvider');
  return items;
}
