import { Button } from '@/components/ui/button';
import { gettingStartedSteps } from '../data/gettingStarted';
import { useRepositoryState } from '../state/DataContext';
import { dismissGettingStarted, useGettingStartedDismissed } from './gettingStartedDismissal';
import { CheckIcon } from './icons';

/**
 * The Portfolio's Getting started strip (§5.2): four self-clearing steps derived from the dataset, gone once all
 * are done or after Dismiss for now (this browser session only, §10.4). It never blocks anything.
 */
export function GettingStartedStrip() {
  const steps = gettingStartedSteps(useRepositoryState());
  const dismissed = useGettingStartedDismissed();

  if (dismissed || steps.every((s) => s.done)) return null;

  return (
    <section aria-labelledby="getting-started-heading" className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card bg-surface-subtle px-3.5 py-2 text-body">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="getting-started-heading" className="m-0 text-heading">
          Getting started
        </h2>
        <ol className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0">
          {steps.map((step, index) => (
            <li key={step.id} className={`flex items-center gap-1.5 ${step.done ? 'text-text-secondary' : ''}`}>
              <span
                aria-hidden="true"
                className={`inline-flex size-check shrink-0 items-center justify-center rounded-full border text-label font-medium ${step.done ? 'border-met bg-met-tint text-met-text' : 'border-border-strong bg-surface-subtle text-text-secondary'}`}
              >
                {step.done ? <CheckIcon width={12} height={12} /> : index + 1}
              </span>
              <a href={step.href} className={step.done ? 'text-text-secondary underline' : 'font-medium text-text-primary underline'}>
                {step.label}
              </a>
              {step.done && <span className="sr-only">Done</span>}
            </li>
          ))}
        </ol>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={dismissGettingStarted}>
        Dismiss for now
      </Button>
    </section>
  );
}
