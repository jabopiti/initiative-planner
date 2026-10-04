import type { Ref } from 'react';
import { Button } from '@/components/ui/button';

/** One line, optionally the reason under it, and one primary action (§9.4) — no illustrations, no tour. */
export function EmptyState({
  line,
  reason,
  actionLabel,
  onAction,
  actionRef,
  actionClassName,
}: {
  line: string;
  reason?: string;
  actionLabel: string;
  onAction: () => void;
  actionRef?: Ref<HTMLButtonElement>;
  actionClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <div>
        <p className="m-0 text-body text-text-secondary">{line}</p>
        {reason && <p className="m-0 mt-1 text-caption text-text-secondary">{reason}</p>}
      </div>
      <Button ref={actionRef} type="button" className={actionClassName} onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
