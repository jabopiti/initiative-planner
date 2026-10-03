import type { PhaseDef } from '../brand/types';
import type { Initiative } from '../data/types';
import { CheckIcon, PhaseIcon, SkippedIcon } from './icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type StepState = 'done' | 'skipped' | 'current' | 'next' | 'ahead';

const STATE_WORD: Record<StepState, string> = { done: 'done', skipped: 'skipped', current: 'current', next: 'next', ahead: 'ahead' };

const STATE_CLASS: Record<StepState, string> = {
  done: 'text-met',
  skipped: 'text-text-secondary',
  current: 'bg-brand-accent-tint font-medium text-brand-accent-text',
  next: 'text-text-secondary',
  ahead: 'text-text-muted',
};

/** Where a phase stands for the stepper: its gate's record behind the current phase, then current, next and ahead. */
function stepState(initiative: Initiative, index: number, currentIndex: number, phase: PhaseDef): StepState {
  if (index < currentIndex) return initiative.gates?.[phase.id]?.outcome === 'skipped' ? 'skipped' : 'done';
  if (index === currentIndex) return 'current';
  return index === currentIndex + 1 ? 'next' : 'ahead';
}

/**
 * The magic bar's phase overview (§5.4, §9.10): each phase's brand-pack icon, the current and the next one also
 * named, the current one as an Accent pill. A done phase adds a tick, both in Met; a skipped one the skip icon. Every
 * step has a tooltip and an accessible name with its state ("Validation, current"), so state is never colour alone (§9.5).
 */
export function PhaseStepper({ process, initiative, currentId }: { process: PhaseDef[]; initiative: Initiative; currentId: string }) {
  const currentIndex = process.findIndex((p) => p.id === currentId);
  return (
    <ol aria-label="Phases" className="m-0 flex list-none items-center gap-1 p-0">
      {process.map((phase, index) => {
        const state = stepState(initiative, index, currentIndex, phase);
        const name = `${phase.label}, ${STATE_WORD[state]}`;
        const labelled = state === 'current' || state === 'next';
        return (
          <li key={phase.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span role="img" aria-label={name} tabIndex={0} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm ${STATE_CLASS[state]}`}>
                  {state === 'done' && <CheckIcon width={16} height={16} />}
                  {state === 'skipped' && <SkippedIcon width={16} height={16} />}
                  <PhaseIcon name={phase.icon} width={16} height={16} />
                  {labelled && phase.label}
                </span>
              </TooltipTrigger>
              <TooltipContent>{name}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ol>
  );
}
