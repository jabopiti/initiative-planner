import { useMemo } from 'react';
import { useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { currentPhaseId } from '../data/processState';
import type { Initiative } from '../data/types';
import { navigate } from '../router/useHashRoute';
import { EmptyState } from './EmptyState';

/**
 * Portfolio overview (§5.2), scoped to slice 003: the board and its two
 * empty states. Filters, key metrics, the Getting started strip and the
 * Needs attention strip are later work (§8.5 and richer §5.2 depend on
 * data slice 003 doesn't create yet).
 */
export function PortfolioBoard() {
  const brand = useBrand();
  const { teams, initiatives } = useRepositoryState();

  const initiativesByPhase = useMemo(() => {
    const byPhase = new Map<string, Initiative[]>(brand.process.map((phase) => [phase.id, []]));
    for (const initiative of initiatives) {
      if (initiative.status !== 'Active') continue;
      byPhase.get(currentPhaseId(initiative, brand.process))?.push(initiative);
    }
    return byPhase;
  }, [brand.process, initiatives]);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  if (teams.length === 0) {
    return (
      <div className="px-8 py-6">
        <EmptyState line="No initiatives yet" actionLabel="Create a team" onAction={() => navigate('/teams')} />
      </div>
    );
  }

  if (initiatives.length === 0) {
    return (
      <div className="px-8 py-6">
        <EmptyState line="No initiatives yet" actionLabel="Create your first initiative" onAction={() => navigate('/initiatives/new')} />
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
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
                    className="block rounded-lg border border-border-default bg-surface-card px-3 py-2.5 text-inherit no-underline"
                    href={`#/initiatives/${initiative.id}`}
                  >
                    <div className="mb-1 text-sm font-semibold">{initiative.name}</div>
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>{teamsById.get(initiative.teamId)?.name ?? 'Unknown team'}</span>
                      <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[11px]">Not yet known</span>
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
