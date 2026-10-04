import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { gettingStartedSteps, type GettingStartedStep } from '../data/gettingStarted';
import { useRepositoryState } from '../state/DataContext';
import { arriveAt } from './arrival';
import { chipTriggerClass } from './chipTriggerClass';
import { dismissGettingStarted, useGettingStartedDismissed } from './gettingStartedDismissal';
import { CheckIcon, ChevronDownIcon, CompleteIcon } from './icons';

/** The Getting started steps (§5.2), how many are done, and whether they show at all: not once all are done or after Dismiss for now. */
function useGettingStarted() {
  const steps = gettingStartedSteps(useRepositoryState());
  const dismissed = useGettingStartedDismissed();
  const done = steps.filter((s) => s.done).length;
  return { steps, done, shown: !dismissed && done < steps.length };
}

/** At three of four done, the strip collapses to a chip in the toolbar row (§5.2). */
const collapses = (done: number, total: number) => done === total - 1;

/** A step's number, or a tick once done. */
export function StepMarker({ step, index, size = 'size-check' }: { step: GettingStartedStep; index: number; size?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border text-label font-medium',
        size,
        step.done ? 'border-met bg-met-tint text-met-text' : 'border-border-strong bg-surface-subtle text-text-secondary',
      )}
    >
      {step.done ? <CheckIcon width={12} height={12} /> : index + 1}
    </span>
  );
}

/** Read after a cleared step's label, which its tick shows to sighted users. */
export function DoneNote() {
  return <span className="sr-only"> (done)</span>;
}

/** A step's link to where it is done (§5.2); following it highlights that place on arrival. */
export function StepLink({ step, className }: { step: GettingStartedStep; className?: string }) {
  return (
    <a href={step.href} onClick={() => arriveAt(step)} className={className}>
      {step.label}
    </a>
  );
}

/** "n of 4 done" as a small bar (§5.2); the count beside it is the text, so the bar itself is hidden from screen readers. */
function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('block h-1.5 w-20 overflow-hidden rounded-full bg-border-default', className)}>
      <span className="block h-full rounded-full bg-met" style={{ width: `${(done / total) * 100}%` }} />
    </span>
  );
}

function DismissButton() {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={dismissGettingStarted}>
      Dismiss for now
    </Button>
  );
}

/**
 * The Portfolio's Getting started strip (§5.2): four self-clearing steps derived from the dataset, cleared ones ticked
 * and struck through beside "n of 4 done" and a progress bar; gone once all are done or after Dismiss for now (this
 * browser session only, §10.4). With `collapsible`, three of four done shows {@link GettingStartedChip} instead. It
 * never blocks anything.
 */
export function GettingStartedStrip({ collapsible = false }: { collapsible?: boolean }) {
  const { steps, done, shown } = useGettingStarted();
  if (!shown || (collapsible && collapses(done, steps.length))) return null;

  return (
    <section aria-labelledby="getting-started-heading" className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card bg-surface-subtle px-3.5 py-2 text-body">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="getting-started-heading" className="m-0 text-heading">
          Getting started
        </h2>
        <ol className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-center gap-1.5">
              <StepMarker step={step} index={index} />
              <StepLink step={step} className={step.done ? 'text-text-secondary line-through' : 'font-medium text-text-primary underline'} />
              {step.done && <DoneNote />}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-text-secondary">
          {done} of {steps.length} done
        </span>
        <ProgressBar done={done} total={steps.length} />
        <DismissButton />
      </div>
    </section>
  );
}

/**
 * Getting started collapsed (§5.2): with three of four steps done, a dashed chip first in the toolbar row,
 * "Getting started · 3 of 4 done", opening the remaining step in a popover with the bar and Dismiss for now.
 */
export function GettingStartedChip() {
  const { steps, done, shown } = useGettingStarted();
  if (!shown || !collapses(done, steps.length)) return null;
  const index = steps.findIndex((s) => !s.done);
  const step = steps[index];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(chipTriggerClass(false), 'border-dashed')}>
          <CompleteIcon width={16} height={16} className="text-met-text" />
          Getting started · {done} of {steps.length} done
          <ChevronDownIcon width={14} height={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-75 p-3.5">
        <p className="m-0 mb-1.5 text-caption text-text-secondary">One step left</p>
        <p className="m-0 flex items-center gap-1.5 text-body">
          <StepMarker step={step} index={index} />
          <StepLink step={step} className="font-medium text-brand-accent-text underline" />
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <ProgressBar done={done} total={steps.length} className="w-30" />
          <DismissButton />
        </div>
      </PopoverContent>
    </Popover>
  );
}
