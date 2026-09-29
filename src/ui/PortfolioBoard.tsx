import { useMemo } from 'react';
import { useIsChangedByOthers, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { currentPhaseId } from '../data/processState';
import { FILE_PATHS, type Initiative } from '../data/types';
import { navigate } from '../router/useHashRoute';
import { NoInitiatives } from './NoInitiatives';
import { NeedsAttentionStrip } from './NeedsAttentionStrip';

/**
 * Portfolio overview (§5.2): the board, the Needs attention strip and the empty state. Filters, key metrics and
 * the Getting started strip are later work.
 */
export function PortfolioBoard() {
  const brand = useBrand();
  const { teams, initiatives } = useRepositoryState();
  const changed = useIsChangedByOthers();

  const initiativesByPhase = useMemo(() => {
    const byPhase = new Map<string, Initiative[]>(brand.process.map((phase) => [phase.id, []]));
    for (const initiative of initiatives) {
      if (initiative.status !== 'Active') continue;
      byPhase.get(currentPhaseId(initiative, brand.process))?.push(initiative);
    }
    return byPhase;
  }, [brand.process, initiatives]);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  if (initiatives.length === 0) return <NoInitiatives />;

  return (
    <div className="px-8 py-6">
      <NeedsAttentionStrip />
      <div className="flex items-start gap-4 overflow-x-auto">
        {brand.process.map((phase) => {
          const phaseInitiatives = initiativesByPhase.get(phase.id) ?? [];
          return (
            <div key={phase.id} className="min-w-55 flex-[1_0_220px] rounded-[10px] bg-surface-subtle p-3">
              <div className="mb-2.5 flex items-center justify-between px-0.5 text-sm font-semibold">
                <span>{phase.label}</span>
                <span className="font-medium text-text-secondary">{phaseInitiatives.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {phaseInitiatives.map((initiative) => (
                  <a
                    key={initiative.id}
                    className={`block rounded-lg border border-border-default px-3 py-2.5 text-inherit no-underline transition-colors duration-500 ${changed(FILE_PATHS.initiative(initiative.id), []) ? 'bg-met-tint' : 'bg-surface-card'}`}
                    href={`#/initiatives/${initiative.id}`}
                  >
                    <div className="mb-1 text-sm font-semibold">{initiative.name}</div>
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>{teamsById.get(initiative.teamId)?.name ?? 'Unknown team'}</span>
                      <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[11px]">No approval track</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
