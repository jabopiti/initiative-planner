import { Button } from '@/components/ui/button';

/** One line and one primary action (§9.4) — no illustrations, no tour. */
export function EmptyState({ line, actionLabel, onAction }: { line: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="m-0 text-[15px] text-text-secondary">{line}</p>
      <Button type="button" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
