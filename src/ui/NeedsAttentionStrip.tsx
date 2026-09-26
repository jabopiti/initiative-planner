import { useState } from 'react';
import type { NeedsAttentionItem, NeedsAttentionKind } from '../data/needsAttention';
import { useNeedsAttentionItems } from '../state/NeedsAttentionContext';
import { actualCellAnchor } from './PhasesSection';
import { DueIcon, EscalatedIcon, OverdueIcon, OverrunIcon, ReadyIcon } from './icons';
import { jumpTargetId } from './jumpTo';

/** Shown at most three at a time (§5.2); "Show n more" reveals the rest in place. */
const COLLAPSED_COUNT = 3;

const KIND_CONFIG: Record<NeedsAttentionKind, { label: string; Icon: typeof OverrunIcon; colorClass: string; tintClass: string }> = {
  // Alarm (only Overrun), Warning (Escalated, Overdue), Met (Ready) and neutral (Due, the gate's ordinary state) — §9.8.
  overrun: { label: 'Overrun', Icon: OverrunIcon, colorClass: 'text-alarm-text', tintClass: 'bg-alarm-tint' },
  escalated: { label: 'Escalated', Icon: EscalatedIcon, colorClass: 'text-warning-text', tintClass: 'bg-warning-tint' },
  overdue: { label: 'Overdue', Icon: OverdueIcon, colorClass: 'text-warning-text', tintClass: 'bg-warning-tint' },
  due: { label: 'Due', Icon: DueIcon, colorClass: 'text-text-secondary', tintClass: 'bg-surface-subtle' },
  ready: { label: 'Ready', Icon: ReadyIcon, colorClass: 'text-met-text', tintClass: 'bg-met-tint' },
};

/** Where a strip item's initiative name opens to (§5.2): the initiative page, scrolled and focused at the place matching its kind. */
function hrefFor(item: NeedsAttentionItem): string {
  const base = `#/initiatives/${item.initiativeId}`;
  switch (item.kind) {
    case 'escalated':
      return `${base}?focus=cost-summary-section`;
    case 'overrun':
      return `${base}?focus=phase-row-${item.phaseId}`;
    case 'overdue':
      return `${base}?focus=${actualCellAnchor(item.phaseId, item.month)}&openPhase=${item.phaseId}`;
    case 'due':
      // A one-element array is enough: jumpTargetId just needs to find item.blocker again, already known to be one.
      return `${base}?focus=${jumpTargetId([item.blocker], item.phaseId) ?? 'magic-bar'}`;
    case 'ready':
      return `${base}?focus=magic-bar`;
  }
}

/** The Portfolio's Needs attention strip (§5.2, §8.5): the ranked list of current-gate states worth a look. */
export function NeedsAttentionStrip() {
  const [expanded, setExpanded] = useState(false);
  const items = useNeedsAttentionItems();

  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const hidden = items.length - shown.length;

  return (
    <section aria-labelledby="needs-attention-heading" className="mb-6 overflow-hidden rounded-lg border border-border-default bg-surface-card">
      <h2 id="needs-attention-heading" className="m-0 border-b border-border-default px-3.5 py-2 text-sm font-semibold">
        Needs attention
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {shown.map((item) => {
          const { label, Icon, colorClass, tintClass } = KIND_CONFIG[item.kind];
          return (
            <li key={item.initiativeId} className="flex items-center gap-2.5 border-t border-border-default px-3.5 py-2 text-sm first:border-t-0">
              <Icon width={16} height={16} className={`shrink-0 ${colorClass}`} />
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${tintClass} ${colorClass}`}>{label}</span>
              <a href={hrefFor(item)} className="shrink-0 font-medium text-text-primary underline">
                {item.initiativeName}
              </a>
              <span className="truncate text-text-secondary">— {item.reason}</span>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="block w-full cursor-pointer border-t border-border-default bg-transparent px-3.5 py-1.5 text-right text-sm font-medium text-brand-accent-text"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more
        </button>
      )}
    </section>
  );
}
