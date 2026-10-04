import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { gettingStartedSteps } from '../data/gettingStarted';
import { navigate } from '../router/useHashRoute';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import { arriveAt } from './arrival';
import { cardClass } from './cardClass';
import { StepMarker } from './GettingStartedStrip';

/**
 * The Portfolio's empty state while no team exists (§9.4): the four Getting started steps as rows, cleared ones ticked,
 * with Create a team as the only primary button; Review rates keeps a text link in its row, later steps are plain
 * text. It is the empty state, so it has no Dismiss for now.
 */
export function WelcomeCard() {
  const { productName } = useBrand();
  const steps = gettingStartedSteps(useRepositoryState());

  return (
    <section aria-labelledby="welcome-heading" className={cn(cardClass, 'mx-auto mt-4 max-w-140 px-6 pt-6 pb-2')}>
      <h2 id="welcome-heading" className="m-0 text-title font-medium">
        Welcome to {productName}
      </h2>
      <p className="m-0 mt-1 mb-4 text-body text-text-secondary">Four steps to your first costed initiative.</p>
      <ol className="m-0 list-none p-0">
        {steps.map((step, index) => (
          <li key={step.id} className="flex h-12 items-center gap-3 border-t border-border-default text-body">
            <StepMarker step={step} index={index} size="size-5.5" />
            <span className={cn('flex-1', step.done || index > 1 ? 'text-text-secondary' : 'font-medium', step.done && 'line-through')}>
              {step.label}
              {step.done && <span className="sr-only"> (done)</span>}
            </span>
            {step.id === 'team' && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  arriveAt(step.id);
                  navigate('/teams');
                }}
              >
                Create a team
              </Button>
            )}
            {step.id === 'rates' && !step.done && (
              <a href={step.href} onClick={() => arriveAt(step.id)} className="text-caption text-brand-accent-text underline">
                Review rates
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
