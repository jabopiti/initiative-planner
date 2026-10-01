import type { Repository } from '../sync/Repository';
import type { Initiative } from '../data/types';
import type { PhaseDef } from '../brand/types';
import { reopenGate } from '../data/gate';
import { isInitiativeFrozen } from '../data/frozen';
import { CancelledIcon, OnHoldIcon, ReopenIcon, ResumeIcon } from './icons';

/** One entry of the header's Actions menu (§5.4). */
export interface InitiativeAction {
  id: string;
  /** The menu text; an action that names what it acts on (Reopen G2) builds it from the process. */
  label: (initiative: Initiative, process: PhaseDef[]) => string;
  icon: typeof OnHoldIcon;
  /** Whether it applies to the initiative now; an action that doesn't is left out of the menu, never shown disabled. */
  applies: (initiative: Initiative, process: PhaseDef[]) => boolean;
  run: (repository: Repository, initiative: Initiative) => void;
}

/**
 * Every action the menu knows, in menu order. Each slice that adds an action (Cancel, Reopen, Delete, Duplicate)
 * adds an entry here, without touching the menu component.
 */
export const initiativeActions: InitiativeAction[] = [
  { id: 'put-on-hold', label: () => 'Put on hold', icon: OnHoldIcon, applies: (i) => i.status === 'Active', run: (repository, i) => repository.putOnHold(i.id) },
  { id: 'resume', label: () => 'Resume', icon: ResumeIcon, applies: (i) => i.status === 'On Hold', run: (repository, i) => repository.resume(i.id) },
  { id: 'cancel', label: () => 'Cancel', icon: CancelledIcon, applies: (i) => !isInitiativeFrozen(i), run: (repository, i) => repository.cancel(i.id) },
  { id: 'reopen', label: () => 'Reopen', icon: ReopenIcon, applies: (i) => i.status === 'Cancelled', run: (repository, i) => repository.reopen(i.id) },
  {
    id: 'reopen-gate',
    label: (i, process) => `Reopen ${reopenGate(process, i)?.phase.exitGate.label}`,
    icon: ReopenIcon,
    applies: (i, process) => reopenGate(process, i) !== null,
    run: (repository, i) => repository.reopenGate(i.id),
  },
];
