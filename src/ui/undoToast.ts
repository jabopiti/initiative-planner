import { toast } from 'sonner';

/** "Removed." with an Undo that stays for 10 seconds (§5.11, §9.9); Undo puts the item back as a normal edit. */
export function undoToast(undo: () => void): void {
  toast('Removed.', { duration: 10_000, action: { label: 'Undo', onClick: undo } });
}
