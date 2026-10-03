import { createContext, useContext } from 'react';
import type { GateRequirement } from '../data/gate';
import { checklistItemAnchor } from './GateChecklistPanel';

/** A place on the initiative page to jump to: its id, and the phase to open first when it lives in a collapsed one. */
export interface Jump {
  id: string;
  phaseId?: string;
}

/** Where a click on a gate's own blocker jumps to (§5.4): the first missing phase's row, or the first blocking checklist item. */
export function firstBlockerJump(requirements: GateRequirement[], phaseId: string): Jump | null {
  const blocker = requirements.find((r) => r.state === 'blocker');
  return blocker ? requirementJump(blocker, phaseId) : null;
}

/**
 * Where one open requirement of a phase's gate lives on the page: the first missing phase's row, opened (§5.4: Go to
 * <phase>), or the checklist item itself (Incomplete or Tentative) — a carried-forward one under the gate it came from (§8.1).
 */
export function requirementJump(requirement: GateRequirement, phaseId: string): Jump {
  if (requirement.kind === 'estimates') {
    const missing = requirement.missingPhaseIds[0];
    return { id: `phase-row-${missing}`, phaseId: missing };
  }
  return { id: checklistItemAnchor(requirement.carried?.originPhaseId ?? phaseId, requirement.itemId) };
}

/** Scrolls an id into view and moves focus to it (or its first focusable control), for keyboard operability (§9.5). */
export function jumpTo(id: string | null | undefined): void {
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (el.matches('input,button,[tabindex]') ? el : el.querySelector<HTMLElement>('input,button,[tabindex]'))?.focus();
}

/**
 * How a control on the initiative page jumps: the page opens the jump's phase, then scrolls and focuses once it is
 * rendered. Outside the page there is no phase to open, so it only scrolls and focuses.
 */
export const JumpContext = createContext<(jump: Jump) => void>((jump) => jumpTo(jump.id));

export const useJump = () => useContext(JumpContext);
