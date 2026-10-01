import type { Repository } from '../sync/Repository';
import type { Initiative } from '../data/types';
import { CancelledIcon, OnHoldIcon, ReopenIcon, ResumeIcon } from './icons';

/** One entry of the header's Actions menu (§5.4). */
export interface InitiativeAction {
  id: string;
  label: string;
  icon: typeof OnHoldIcon;
  /** Whether it applies to the initiative now; an action that doesn't is left out of the menu, never shown disabled. */
  applies: (initiative: Initiative) => boolean;
  run: (repository: Repository, initiative: Initiative) => void;
}

/**
 * Every action the menu knows, in menu order. Each slice that adds an action (Cancel, Reopen, Delete, Duplicate)
 * adds an entry here, without touching the menu component.
 */
export const initiativeActions: InitiativeAction[] = [
  { id: 'put-on-hold', label: 'Put on hold', icon: OnHoldIcon, applies: (i) => i.status === 'Active', run: (repository, i) => repository.putOnHold(i.id) },
  { id: 'resume', label: 'Resume', icon: ResumeIcon, applies: (i) => i.status === 'On Hold', run: (repository, i) => repository.resume(i.id) },
  { id: 'cancel', label: 'Cancel', icon: CancelledIcon, applies: (i) => i.status === 'Active' || i.status === 'On Hold', run: (repository, i) => repository.cancel(i.id) },
  { id: 'reopen', label: 'Reopen', icon: ReopenIcon, applies: (i) => i.status === 'Cancelled', run: (repository, i) => repository.reopen(i.id) },
];
