import { useBrand } from '../state/BrandContext';
import { useRepository } from '../state/DataContext';
import { reopenGate } from '../data/gate';
import type { Initiative } from '../data/types';
import { FrozenIcon } from './icons';
import { Button } from '@/components/ui/button';

/**
 * The persistent strip under a Closed or Cancelled initiative's header (§8.4, §9.9): what froze it, that notes and
 * actuals still take edits, and the one-click way back — Reopen for Cancelled, Reopen <final gate> for Closed (§8.3).
 * Plain text read with the page, not a live region. Nothing for any other status.
 */
export function FrozenStrip({ initiative }: { initiative: Initiative }) {
  const repository = useRepository();
  const { process } = useBrand();
  if (initiative.status !== 'Cancelled' && initiative.status !== 'Closed') return null;

  const finalGate = process[process.length - 1]?.exitGate.label;
  const reopenable = initiative.status === 'Closed' ? reopenGate(process, initiative) : null;
  const what = initiative.status === 'Cancelled' ? 'Cancelled.' : `Closed after ${finalGate}.`;

  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-border-default bg-surface-subtle py-2 pr-2 pl-3 text-sm text-text-secondary">
      <FrozenIcon width={16} height={16} />
      <p className="m-0 flex-1">{what} Notes and actuals can still be recorded.</p>
      {initiative.status === 'Cancelled' ? (
        <Button type="button" variant="outline" size="sm" aria-label={`Reopen ${initiative.name}`} onClick={() => repository.reopen(initiative.id)}>
          Reopen
        </Button>
      ) : (
        reopenable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Reopen ${reopenable.phase.exitGate.label} of ${initiative.name}`}
            onClick={() => repository.reopenGate(initiative.id)}
          >
            Reopen {reopenable.phase.exitGate.label}
          </Button>
        )
      )}
    </div>
  );
}
