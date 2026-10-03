import { toast } from 'sonner';
import { isInitiativeFrozen, isPhaseFrozen } from '../data/frozen';
import type { Repository } from '../sync/Repository';

/**
 * "Removed." with an Undo that stays for 10 seconds (§5.11, §9.9); Undo puts the item back as a normal edit. The
 * offer is withdrawn once the item's phase freezes or its initiative is Closed or Cancelled, here or by a pull
 * (§5.11, §8.1, §8.4): the data layer would refuse it then.
 */
export function undoToast(undo: () => void, { repository, initiativeId, phaseId }: { repository: Repository; initiativeId: string; phaseId: string }): void {
  const locked = () => {
    const initiative = repository.getState().initiatives.find((i) => i.id === initiativeId);
    return !initiative || isInitiativeFrozen(initiative) || isPhaseFrozen(initiative, phaseId);
  };
  let stop = () => {};
  const id = toast('Removed.', { duration: 10_000, action: { label: 'Undo', onClick: undo }, onDismiss: () => stop(), onAutoClose: () => stop() });
  const unsubscribe = repository.subscribe(() => {
    if (!locked()) return;
    stop();
    toast.dismiss(id);
  });
  stop = () => {
    unsubscribe();
  };
}
