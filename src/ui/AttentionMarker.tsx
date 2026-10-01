import type { ComponentType, SVGProps } from 'react';
import type { NeedsAttentionItem } from '../data/needsAttention';
import { KIND_CONFIG } from './NeedsAttentionStrip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** An icon-only marker (§9.10): focusable, named by `label`, explained by its tooltip. */
export function IconMarker({ label, tooltip, Icon, className }: { label: string; tooltip: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; className: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={label} tabIndex={0} className={`inline-flex shrink-0 ${className}`}>
          <Icon width={16} height={16} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** The icon-only Needs attention marker (§9.10): the kind is its accessible name, kind and reason its tooltip. */
export function AttentionMarker({ item }: { item: NeedsAttentionItem }) {
  const config = KIND_CONFIG[item.kind];
  return <IconMarker label={config.label} tooltip={`${config.label}: ${item.reason}`} Icon={config.Icon} className={config.colorClass} />;
}
