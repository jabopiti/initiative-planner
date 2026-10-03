import { toast } from 'sonner';
import { isPhaseLocked } from '../data/frozen';
import type { Repository } from '../sync/Repository';

/**
 * "Removed." with an Undo that stays for 10 seconds (§5.11, §9.9); Undo puts the item back as a normal edit. The
 * offer is withdrawn once the item's phase freezes or its initiative is Closed or Cancelled, here or by a pull
 * (§5.11, §8.1, §8.4): the data layer would refuse it then. Without `watch` (a membership has no phase) it just times out.
 */
export function undoToast(undo: () => void, watch?: { repository: Repository; initiativeId: string; phaseId: string }): void {
  // Sonner closes the toast on its action without calling onDismiss, so Undo unsubscribes itself.
  const id = toast('Removed.', {
    duration: 10_000,
    action: {
      label: 'Undo',
      onClick: () => {
        unsubscribe();
        undo();
      },
    },
    onDismiss: () => unsubscribe(),
    onAutoClose: () => unsubscribe(),
  });
  const unsubscribe = watch
    ? watch.repository.subscribe(() => {
        const initiative = watch.repository.getState().initiatives.find((i) => i.id === watch.initiativeId);
        if (!initiative || isPhaseLocked(initiative, watch.phaseId)) toast.dismiss(id);
      })
    : () => {};
}

/** Remove a membership with "Removed. Undo" (§5.11); an Undo the data layer refuses says why. */
export function removeMembershipWithUndo(repository: Repository, membershipId: string): void {
  const removed = repository.removeMembership(membershipId);
  if (!removed) return;
  undoToast(() => {
    const result = repository.restoreMembership(removed.membership, removed.index);
    if (!result.ok) toast.error(result.message);
  });
}
