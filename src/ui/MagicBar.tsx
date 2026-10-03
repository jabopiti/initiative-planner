import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { currentPhaseId, gateBlockers, gateOverdue, gateRequirements, onHoldMessage, overrunMessage, READY_MESSAGE } from '../data/gate';
import { localToday } from '../data/dates';
import { useBrand } from '../state/BrandContext';
import { useRepository } from '../state/DataContext';
import type { Initiative } from '../data/types';
import { isInitiativeFrozen } from '../data/frozen';
import { canChooseStartingPhase, gatesBehindLabel, hasStartingPhase, startingPhaseChoices } from '../data/startingPhase';
import { jumpTargetId, jumpTo } from './jumpTo';
import { OnHoldIcon, OverrunIcon, ResumeIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** How long "Passed <gate> — Reopen" (or "Skipped <gate> — Reopen") shows before the bar moves on (§5.4, §9.9: a few seconds). */
const PASSED_MESSAGE_MS = 5000;

/** The current phase's own row for the stepper (§5.4): a compact dot, current one accented. */
function StepperDot({ state }: { state: 'done' | 'current' | 'ahead' }) {
  const cls = state === 'done' ? 'bg-met' : state === 'current' ? 'bg-brand-accent' : 'bg-border-strong';
  return <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${cls}`} />;
}

/**
 * The sticky bottom bar (§5.4): the phase stepper on its own row, guidance and the Pass gate action below it, with
 * Skip <gate> beside Pass gate where the gate is skippable (§8.2). While the initiative is untouched, a text action after
 * the stepper's dots opens the starting-phase form in place of the guidance and the gate actions (§5.4, §8.2). Hidden for a Closed or Cancelled initiative, since
 * nothing is actionable.
 */
export function MagicBar({ initiative }: { initiative: Initiative }) {
  const { process } = useBrand();
  const repository = useRepository();
  // "Passed G2" or "Skipped G2", shown with Reopen for a few seconds after the gate is passed or skipped.
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [holdAsked, setHoldAsked] = useState<'pass' | 'skip' | null>(null);
  // The skip reason being typed, tied to the gate it was opened on (§8.2).
  const [skipping, setSkipping] = useState<{ phaseId: string; reason: string } | null>(null);
  // The starting phase being chosen (§8.2): '' until one is picked, and the one reason.
  const [starting, setStarting] = useState<{ phaseId: string; reason: string } | null>(null);
  const passButton = useRef<HTMLButtonElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const onHold = initiative.status === 'On Hold';
  const phaseId = currentPhaseId(initiative, process);
  const canStart = canChooseStartingPhase(initiative);
  // The on-hold answer to a selected Pass gate lasts until the hold ends, however it ends (this bar's Resume or the menu's).
  if (!onHold && holdAsked) setHoldAsked(null);
  // Putting it on hold ends the "Passed <gate> — Reopen" message at once.
  if (onHold && doneMessage) setDoneMessage(null);
  // Skipping ends, with nothing saved, once the gate it was opened on is no longer the one to skip (§8.2).
  if (skipping && (initiative.status !== 'Active' || skipping.phaseId !== phaseId)) setSkipping(null);
  // Choosing a starting phase ends, with nothing saved, once the initiative is touched or no longer Active (§8.2).
  if (starting && (!canStart || starting.phaseId === phaseId)) setStarting(null);

  useEffect(() => {
    if (!doneMessage) return;
    const timer = setTimeout(() => setDoneMessage(null), PASSED_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [doneMessage]);

  if (isInitiativeFrozen(initiative)) return null;

  const phase = process.find((p) => p.id === phaseId)!;
  const today = localToday();
  const requirements = gateRequirements(process, initiative, phaseId);
  const blockers = gateBlockers(requirements);
  const ready = blockers.length === 0;
  const overdue = gateOverdue(initiative, phase, today);
  const endDate = initiative.phases?.[phase.id]?.endDate;

  const gateLabel = phase.exitGate.label;
  const pass = () => {
    const result = repository.passGate(initiative.id);
    if (result.ok) setDoneMessage(`Passed ${gateLabel}`);
  };
  const skipReason = skipping?.reason.trim() ?? '';
  const skip = () => {
    const result = repository.skipGate(initiative.id, skipReason);
    if (!result.ok) return;
    setSkipping(null);
    setDoneMessage(`Skipped ${gateLabel}`);
  };
  // Back to the Skip action the field replaced, once it is rendered again.
  const cancelSkip = () => {
    flushSync(() => setSkipping(null));
    skipButton.current?.focus();
  };
  const startChoice = starting ? process.find((p) => p.id === starting.phaseId) : undefined;
  const startGates = startChoice ? gatesBehindLabel(process, startChoice.id) : '';
  // The first phase removes every starting-phase skip, so it needs no reason (§8.2).
  const startNeedsReason = startChoice !== process[0];
  const startReady = Boolean(startChoice) && (!startNeedsReason || Boolean(starting?.reason.trim()));
  // Back to the action the form replaced, once it is rendered again (it reads "Change starting phase" after a start).
  const closeStart = () => {
    flushSync(() => setStarting(null));
    startButton.current?.focus();
  };
  const start = () => {
    if (!starting || !startReady) return;
    if (repository.startAtPhase(initiative.id, starting.phaseId, starting.reason).ok) closeStart();
  };
  const offerStart = canStart && !skipping && !starting && !doneMessage;

  const jump = () => jumpTo(jumpTargetId(requirements, phaseId));
  const extend = () => repository.extendPhase(initiative.id, phase.id);

  const resume = () => {
    repository.resume(initiative.id);
    // Resume's own button is gone once the bar is back to its gate state; focus goes to the action that replaces it.
    passButton.current?.focus();
  };

  // The first blocker always names something specific (AC1, AC2), whatever else is also open.
  let guidance: string;
  if (onHold) guidance = holdAsked ? onHoldMessage(initiative, process, holdAsked) : 'On hold';
  else if (doneMessage) guidance = doneMessage;
  else if (overdue && endDate) guidance = overrunMessage(phase, endDate, today);
  else if (ready) guidance = READY_MESSAGE;
  else guidance = blockers.length > 1 ? `${blockers[0]} (+${blockers.length - 1} more)` : blockers[0];

  return (
    <div id="magic-bar" role="region" aria-label="Magic bar" className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border-default bg-surface-card px-4 py-3 shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {process.map((p, i) => (
            <StepperDot key={p.id} state={i < process.indexOf(phase) ? 'done' : p.id === phaseId ? 'current' : 'ahead'} />
          ))}
        </div>
        {offerStart && (
          <button
            ref={startButton}
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-sm text-text-secondary underline"
            onClick={() => setStarting({ phaseId: '', reason: '' })}
          >
            {hasStartingPhase(initiative) ? 'Change starting phase' : 'Start at a later phase'}
          </button>
        )}
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
        ) : starting ? (
          <div className="flex flex-1 items-center gap-2">
            <span id="start-at-label" className="text-sm whitespace-nowrap text-text-secondary">
              Start at
            </span>
            <Select value={starting.phaseId} onValueChange={(id) => setStarting({ ...starting, phaseId: id })}>
              <SelectTrigger
                autoFocus
                aria-labelledby="start-at-label"
                className="w-auto"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeStart();
                }}
              >
                <SelectValue placeholder="Choose a phase" />
              </SelectTrigger>
              <SelectContent>
                {startingPhaseChoices(process, phaseId).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {startNeedsReason && (
              <>
                <label htmlFor="start-reason" className="text-sm whitespace-nowrap text-text-secondary">
                  {startGates ? `Reason for skipping ${startGates}` : 'Reason'}
                </label>
                <Input
                  id="start-reason"
                  value={starting.reason}
                  onChange={(e) => setStarting({ ...starting, reason: e.target.value })}
                  onKeyDown={(e) => {
                    // Focus moves to the action on success; without this the same Enter would click it open again.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      start();
                    } else if (e.key === 'Escape') closeStart();
                  }}
                />
              </>
            )}
          </div>
        ) : skipping ? (
          <div className="flex flex-1 items-center gap-2">
            <label htmlFor="skip-reason" className="text-sm whitespace-nowrap text-text-secondary">
              Reason for skipping {gateLabel}
            </label>
            <Input
              id="skip-reason"
              autoFocus
              value={skipping.reason}
              onChange={(e) => setSkipping({ phaseId, reason: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') skip();
                else if (e.key === 'Escape') cancelSkip();
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p className={`m-0 flex items-center gap-1.5 text-sm ${overdue && !doneMessage ? 'font-medium text-alarm-text' : 'text-text-secondary'}`}>
              {overdue && !doneMessage && <OverrunIcon width={16} height={16} className="shrink-0" />}
              {!ready && !doneMessage ? (
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left underline" onClick={jump}>
                  {guidance}
                </button>
              ) : (
                guidance
              )}
            </p>
            {overdue && !doneMessage && (
              <button type="button" className="w-fit cursor-pointer border-0 bg-transparent p-0 text-left text-sm text-text-secondary underline" onClick={extend}>
                Extend {phase.label} by one month
              </button>
            )}
          </div>
        )}
        {doneMessage ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => repository.reopenGate(initiative.id)}>
            Reopen
          </Button>
        ) : starting ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" onClick={closeStart}>
              Cancel
            </Button>
            <Button type="button" disabled={!startReady} onClick={start}>
              {startChoice ? `Start at ${startChoice.label}` : 'Start'}
            </Button>
          </div>
        ) : skipping ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" onClick={cancelSkip}>
              Cancel
            </Button>
            <Button type="button" disabled={!skipReason} onClick={skip}>
              Skip {gateLabel}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-3">
            {phase.exitGate.skippable && (
              <button
                ref={skipButton}
                type="button"
                className={`cursor-pointer border-0 bg-transparent p-0 text-sm underline ${onHold ? 'text-text-muted' : 'text-text-secondary'}`}
                onClick={onHold ? () => setHoldAsked('skip') : () => setSkipping({ phaseId, reason: '' })}
              >
                Skip {gateLabel}
              </button>
            )}
            <Button ref={passButton} type="button" variant={ready && !onHold ? 'default' : 'ghost'} onClick={onHold ? () => setHoldAsked('pass') : ready ? pass : jump}>
              Pass gate
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
