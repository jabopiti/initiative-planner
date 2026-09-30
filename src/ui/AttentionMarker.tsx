import type { NeedsAttentionItem } from '../data/needsAttention';
import { KIND_CONFIG } from './NeedsAttentionStrip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** The icon-only Needs attention marker (§9.10): the kind is its accessible name, kind and reason its tooltip. */
export function AttentionMarker({ item }: { item: NeedsAttentionItem }) {
  const config = KIND_CONFIG[item.kind];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={config.label} tabIndex={0} className={`inline-flex shrink-0 ${config.colorClass}`}>
          <config.Icon width={16} height={16} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{`${config.label}: ${item.reason}`}</TooltipContent>
    </Tooltip>
  );
}
