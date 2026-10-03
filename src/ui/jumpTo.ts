import type { GateRequirement } from '../data/gate';
import { checklistItemAnchor } from './GateChecklistPanel';

/** Where a click on a gate's own blocker jumps to (§5.4): the first missing phase's row, or the first blocking checklist item. */
export function jumpTargetId(requirements: GateRequirement[], phaseId: string): string | null {
  const blocker = requirements.find((r) => r.state === 'blocker');
  return blocker ? requirementAnchor(blocker, phaseId) : null;
}

/**
 * Where one open requirement of a phase's gate lives on the page: the first missing phase's row, or the checklist item
 * itself (Incomplete or Tentative) — a carried-forward one under the gate it came from (§8.1).
 */
export function requirementAnchor(requirement: GateRequirement, phaseId: string): string {
  if (requirement.kind === 'estimates') return `phase-row-${requirement.missingPhaseIds[0]}`;
  return checklistItemAnchor(requirement.carried?.originPhaseId ?? phaseId, requirement.itemId);
}

/**
 * Scrolls an id into view and moves focus to it (or its first focusable control), for keyboard operability (§9.5).
 * A collapsed phase at the target opens first (§5.4: Go to <phase>), so what it lacks is in view.
 */
export function jumpTo(id: string | null | undefined): void {
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector<HTMLButtonElement>('[data-phase-toggle][aria-expanded="false"]')?.click();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (el.matches('input,button,[tabindex]') ? el : el.querySelector<HTMLElement>('input,button,[tabindex]'))?.focus();
}
