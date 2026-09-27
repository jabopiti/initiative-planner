import type { GateRequirement } from '../data/gate';
import { checklistItemAnchor } from './GateChecklistPanel';

/** Where a click on a gate's own blocker jumps to (§5.4): the first missing phase's row, or the first blocking checklist item. */
export function jumpTargetId(requirements: GateRequirement[], phaseId: string): string | null {
  const blocker = requirements.find((r) => r.state === 'blocker');
  if (!blocker) return null;
  return blocker.kind === 'estimates' ? `phase-row-${blocker.missingPhaseIds[0]}` : checklistItemAnchor(phaseId, blocker.itemId);
}

/** Scrolls an id into view and moves focus to it (or its first focusable control), for keyboard operability (§9.5). */
export function jumpTo(id: string | null | undefined): void {
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (el.matches('input,button,[tabindex]') ? el : el.querySelector<HTMLElement>('input,button,[tabindex]'))?.focus();
}
