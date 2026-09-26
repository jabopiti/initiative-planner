import { useEffect, useState } from 'react';
import { currentPhaseId, gateBlockers, gateOverdue, gateRequirements } from '../data/gate';
import { daysBetween, localToday } from '../data/dates';
import { useBrand } from '../state/BrandContext';
import { useRepository } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { jumpTargetId, jumpTo } from './jumpTo';
import { OverrunIcon } from './icons';
import { Button } from '@/components/ui/button';

/** How long "Passed <gate> — Reopen" shows before the bar moves on (§5.4, §9.9: a few seconds). */
const PASSED_MESSAGE_MS = 5000;

/** The current phase's own row for the stepper (§5.4): a compact dot, current one accented. */
function StepperDot({ state }: { state: 'done' | 'current' | 'ahead' }) {
  const cls = state === 'done' ? 'bg-met' : state === 'current' ? 'bg-brand-accent' : 'bg-border-strong';
  return <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${cls}`} />;
}

/**
 * The sticky bottom bar (§5.4): the phase stepper on its own row, guidance and the Pass gate action below it.
 * Hidden for a Closed or Cancelled initiative, since nothing is actionable.
 */
export function MagicBar({ initiative }: { initiative: Initiative }) {
  const { process } = useBrand();
  const repository = useRepository();
  const [passed, setPassed] = useState<string | null>(null);

  useEffect(() => {
    if (!passed) return;
    const timer = setTimeout(() => setPassed(null), PASSED_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [passed]);

  if (initiative.status === 'Closed' || initiative.status === 'Cancelled') return null;

  const phaseId = currentPhaseId(initiative, process);
  const phase = process.find((p) => p.id === phaseId)!;
  const today = localToday();
  const requirements = gateRequirements(process, initiative, phaseId);
  const blockers = gateBlockers(requirements);
  const ready = blockers.length === 0;
  const overdue = gateOverdue(initiative, phase, today);
  const endDate = initiative.phases?.[phase.id]?.endDate;

  const pass = () => {
    const result = repository.passGate(initiative.id);
    if (result.ok) setPassed(phase.exitGate.label);
  };
  const jump = () => jumpTo(jumpTargetId(requirements, phaseId));

  // The first blocker always names something specific (AC1, AC2), whatever else is also open.
  let guidance: string;
  if (passed) guidance = `Passed ${passed}`;
  else if (overdue && endDate) guidance = `${phase.label} is ${daysBetween(endDate, today)} days overrun`;
  else if (ready) guidance = 'All requirements met';
  else guidance = blockers.length > 1 ? `${blockers[0]} (+${blockers.length - 1} more)` : blockers[0];

  return (
    <div id="magic-bar" className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border-default bg-surface-card px-4 py-3 shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {process.map((p, i) => (
          <StepperDot key={p.id} state={i < process.indexOf(phase) ? 'done' : p.id === phaseId ? 'current' : 'ahead'} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className={`m-0 flex items-center gap-1.5 text-sm ${overdue && !passed ? 'font-medium text-alarm-text' : 'text-text-secondary'}`}>
          {overdue && !passed && <OverrunIcon width={16} height={16} className="shrink-0" />}
          {!ready && !passed ? (
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left underline" onClick={jump}>
              {guidance}
            </button>
          ) : (
            guidance
          )}
        </p>
        {passed ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => repository.reopenGate(initiative.id)}>
            Reopen
          </Button>
        ) : (
          <Button type="button" variant={ready ? 'default' : 'ghost'} onClick={ready ? pass : jump}>
            Pass gate
          </Button>
        )}
      </div>
    </div>
  );
}
