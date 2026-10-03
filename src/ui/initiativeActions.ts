import type { Repository } from '../sync/Repository';
import type { Initiative } from '../data/types';
import type { PhaseDef } from '../brand/types';
import { reopenGate } from '../data/gate';
import { hasPassedGate, isInitiativeFrozen } from '../data/frozen';
import { toast } from 'sonner';
import { navigate, normalizeHash } from '../router/useHashRoute';
import { CancelledIcon, DuplicateIcon, OnHoldIcon, RemoveIcon, ReopenIcon, ResumeIcon } from './icons';

/** What an action can ask of the page around the menu, for an action that does not act in one click. */
export interface InitiativeActionUi {
  /** Open the inline delete confirmation under the header (§9.9); returns how to focus it once the menu has closed. */
  confirmDelete: () => () => void;
}

/** One entry of the header's Actions menu (§5.4). */
export interface InitiativeAction {
  id: string;
  /** The menu text; an action that names what it acts on (Reopen G2) builds it from the process. */
  label: (initiative: Initiative, process: PhaseDef[]) => string;
  icon: typeof OnHoldIcon;
  /** Whether it applies to the initiative now; an action that doesn't is left out of the menu, never shown disabled. */
  applies: (initiative: Initiative, process: PhaseDef[]) => boolean;
  /** May return where focus goes once the menu has closed, for an action that opens something (it would otherwise return to ⋯). */
  run: (repository: Repository, initiative: Initiative, ui: InitiativeActionUi) => void | (() => void);
  /**
   * Where it sits after the separator that closes the menu: `ending` (Cancel) ends the initiative's work, in the
   * normal style; `destructive` (Delete) is irreversible, last, in the destructive style. Left out, it is a normal item.
   */
  tier?: ActionTier;
}

export type ActionTier = 'ending' | 'destructive';

const TIER_ORDER: (ActionTier | undefined)[] = [undefined, 'ending', 'destructive'];

/** The applicable actions in menu order: normal items first, then the ending, then the destructive tier. */
export function menuOrder(actions: InitiativeAction[]): InitiativeAction[] {
  return [...actions].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}

let duplicating = false;

/**
 * Duplicate (§5.11): the copy opens in place as a new history entry once it is saved, and a toast names anyone left out
 * of its allocations. A second choice while one is saving is ignored; a failed save opens nothing (the read-only banner
 * says why); a user who has moved on meanwhile is left where they are.
 */
function duplicate(repository: Repository, initiative: Initiative): void {
  if (duplicating) return;
  duplicating = true;
  const origin = `/initiatives/${initiative.id}`;
  repository
    .duplicateInitiative(initiative.id)
    .then((result) => {
      if (!result || normalizeHash(window.location.hash).split('?')[0] !== origin) return;
      navigate(`/initiatives/${result.initiative.id}`);
      if (result.skipped.length > 0) toast(`Not copied: ${result.skipped.map((p) => p.name).join(', ')}, no longer on ${result.team.name}.`);
    })
    .catch(() => {})
    .finally(() => {
      duplicating = false;
    });
}

/**
 * Every action the menu knows, in menu order. Each slice that adds an action (Cancel, Reopen, Delete, Duplicate)
 * adds an entry here, without touching the menu component.
 */
export const initiativeActions: InitiativeAction[] = [
  { id: 'put-on-hold', label: () => 'Put on hold', icon: OnHoldIcon, applies: (i) => i.status === 'Active', run: (repository, i) => repository.putOnHold(i.id) },
  { id: 'resume', label: () => 'Resume', icon: ResumeIcon, applies: (i) => i.status === 'On Hold', run: (repository, i) => repository.resume(i.id) },
  { id: 'cancel', label: () => 'Cancel initiative', icon: CancelledIcon, applies: (i) => !isInitiativeFrozen(i), run: (repository, i) => repository.cancel(i.id), tier: 'ending' },
  { id: 'duplicate', label: () => 'Duplicate', icon: DuplicateIcon, applies: () => true, run: (repository, i) => duplicate(repository, i) },
  { id: 'reopen', label: () => 'Reopen', icon: ReopenIcon, applies: (i) => i.status === 'Cancelled', run: (repository, i) => repository.reopen(i.id) },
  {
    id: 'reopen-gate',
    label: (i, process) => `Reopen ${reopenGate(process, i)?.phase.exitGate.label}`,
    icon: ReopenIcon,
    applies: (i, process) => reopenGate(process, i) !== null,
    run: (repository, i) => repository.reopenGate(i.id),
  },
  // In any status, while no gate was passed (§9.3); a skipped gate approved nothing, so it does not count.
  { id: 'delete', label: () => 'Delete', icon: RemoveIcon, applies: (i) => !hasPassedGate(i), run: (_, __, ui) => ui.confirmDelete(), tier: 'destructive' },
];
