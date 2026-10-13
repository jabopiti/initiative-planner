import { toast } from 'sonner';

export const CLIPBOARD_REFUSED = "Couldn't copy. Your browser blocked clipboard access.";

/**
 * Copies a prompt (§9.12) as plain text only, and says so in a toast: what was copied, or that the clipboard refused,
 * with nothing else changed (§9.9). Toasts, since a prompt copied from a menu has no button left to sit beside.
 */
export async function copyPrompt(text: string, copied: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(copied);
  } catch {
    toast.error(CLIPBOARD_REFUSED);
  }
}
