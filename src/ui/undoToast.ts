import { toast } from 'sonner';
import { isPhaseLocked } from '../data/frozen';
import type { Repository } from '../sync/Repository';

/**
 * "Removed." with an Undo that stays for 10 seconds (§5.11, §9.9); Undo puts the item back as a normal edit. The
 * offer is withdrawn once the item's phase freezes or its initiative is Closed or Cancelled, here or by a pull
 * (§5.11, §8.1, §8.4): the data layer would refuse it then.
 */
export function undoToast(undo: () => void, { repository, initiativeId, phaseId }: { repository: Repository; initiativeId: string; phaseId: string }): void {
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
  const unsubscribe = repository.subscribe(() => {
    const initiative = repository.getState().initiatives.find((i) => i.id === initiativeId);
    if (!initiative || isPhaseLocked(initiative, phaseId)) toast.dismiss(id);
  });
}
