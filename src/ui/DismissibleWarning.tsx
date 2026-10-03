import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { WarningIcon } from './icons';

/** The warning strip under the top bar with a Dismiss button (§5.10, §3 Storage limits). */
export function DismissibleWarning({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2 border-b border-border-default bg-warning-tint px-4 py-2 text-body text-warning-text">
      <span className="flex flex-1 items-center gap-1.5">
        <WarningIcon />
        <span>{children}</span>
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
