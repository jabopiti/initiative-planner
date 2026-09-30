import { useEffect, useRef, useState } from 'react';
import { currentPhaseId, gateBlockers, gateOverdue, gateRequirements, onHoldMessage, overrunMessage, READY_MESSAGE } from '../data/gate';
import { localToday } from '../data/dates';
import { useBrand } from '../state/BrandContext';
import { useRepository } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { jumpTargetId, jumpTo } from './jumpTo';
import { OnHoldIcon, OverrunIcon, ResumeIcon } from './icons';
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
  const [holdAsked, setHoldAsked] = useState(false);
  const passButton = useRef<HTMLButtonElement>(null);
  const onHold = initiative.status === 'On Hold';
  // The on-hold answer to a selected Pass gate lasts until the hold ends, however it ends (this bar's Resume or the menu's).
  if (!onHold && holdAsked) setHoldAsked(false);
  // Putting it on hold ends the "Passed <gate> — Reopen" message at once.
  if (onHold && passed) setPassed(null);

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
  const extend = () => repository.extendPhase(initiative.id, phase.id);

  const resume = () => {
    repository.resume(initiative.id);
    // Resume's own button is gone once the bar is back to its gate state; focus goes to the action that replaces it.
    passButton.current?.focus();
  };

  // The first blocker always names something specific (AC1, AC2), whatever else is also open.
  let guidance: string;
  if (onHold) guidance = holdAsked ? onHoldMessage(initiative, process) : 'On hold';
  else if (passed) guidance = `Passed ${passed}`;
  else if (overdue && endDate) guidance = overrunMessage(phase, endDate, today);
  else if (ready) guidance = READY_MESSAGE;
  else guidance = blockers.length > 1 ? `${blockers[0]} (+${blockers.length - 1} more)` : blockers[0];

  return (
    <div id="magic-bar" className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border-default bg-surface-card px-4 py-3 shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {process.map((p, i) => (
          <StepperDot key={p.id} state={i < process.indexOf(phase) ? 'done' : p.id === phaseId ? 'current' : 'ahead'} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        {onHold ? (
          <div className="flex items-center gap-3">
            <p className="m-0 flex items-center gap-1.5 text-sm text-text-secondary">
              <OnHoldIcon width={16} height={16} className="shrink-0" />
              {guidance}
            </p>
            <Button type="button" size="sm" onClick={resume}>
              <ResumeIcon />
              Resume
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
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
            {overdue && !passed && (
              <button type="button" className="w-fit cursor-pointer border-0 bg-transparent p-0 text-left text-sm text-text-secondary underline" onClick={extend}>
                Extend {phase.label} by one month
              </button>
            )}
          </div>
        )}
        {passed ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => repository.reopenGate(initiative.id)}>
            Reopen
          </Button>
        ) : (
          <Button ref={passButton} type="button" variant={ready && !onHold ? 'default' : 'ghost'} onClick={onHold ? () => setHoldAsked(true) : ready ? pass : jump}>
            Pass gate
          </Button>
        )}
      </div>
    </div>
  );
}
