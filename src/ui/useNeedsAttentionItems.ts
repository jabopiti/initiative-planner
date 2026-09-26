import { useMemo } from 'react';
import { localToday } from '../data/dates';
import { needsAttentionItems, type NeedsAttentionItem } from '../data/needsAttention';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';

/** The Portfolio's Needs attention items (§8.5), shared by the strip and the Initiatives nav count (§5.1) so both read one computed list. */
export function useNeedsAttentionItems(): NeedsAttentionItem[] {
  const { process, approvalTracks } = useBrand();
  const { initiatives, people, roles, countries } = useRepositoryState();
  const today = localToday();
  return useMemo(
    () => needsAttentionItems(initiatives, process, people, { roles, countries }, approvalTracks, today),
    [initiatives, process, people, roles, countries, approvalTracks, today],
  );
}
