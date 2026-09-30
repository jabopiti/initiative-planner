import { useMemo } from 'react';
import { useIsChangedByOthers, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { grandEstimate } from '../data/cost';
import { ownerLabel } from '../data/initiativeList';
import { currentPhaseId } from '../data/processState';
import { FILE_PATHS, type Initiative } from '../data/types';
import { useNeedsAttentionItems } from '../state/NeedsAttentionContext';
import { ApprovalTrackBadge } from './ApprovalTrackBadge';
import { AttentionMarker } from './AttentionMarker';
import { CompactAmount } from './CompactAmount';
import { TruncatedText } from './TruncatedText';
import { NoInitiatives } from './NoInitiatives';
import { NeedsAttentionStrip } from './NeedsAttentionStrip';

/** One initiative's card (§5.2): name and attention marker, team · owner, compact estimate and approval track; the whole card is the link. */
function BoardCard({ initiative, teamName, total }: { initiative: Initiative; teamName: string; total: number }) {
  const { people } = useRepositoryState();
  const attention = useNeedsAttentionItems();
  const changed = useIsChangedByOthers();
  const item = attention.find((i) => i.initiativeId === initiative.id);
  return (
    <a
      className={`block rounded-lg border border-border-default px-3 py-2.5 text-inherit no-underline transition-colors duration-500 ${changed(FILE_PATHS.initiative(initiative.id), []) ? 'bg-met-tint' : 'bg-surface-card'}`}
      href={`#/initiatives/${initiative.id}`}
    >
      <div className="flex items-center justify-between gap-1.5 text-sm font-semibold">
        <TruncatedText text={initiative.name} className="min-w-0" />
        {item && <AttentionMarker item={item} />}
      </div>
      <div className="mb-1.5 mt-0.5 truncate text-xs text-text-secondary">
        {teamName} · {initiative.ownerId ? ownerLabel(initiative.ownerId, people) : 'No owner'}
      </div>
      <div className="flex items-center justify-between text-xs">
        <CompactAmount value={total} />
        <ApprovalTrackBadge initiative={initiative} />
      </div>
    </a>
  );
}

/**
 * Portfolio overview (§5.2): the board, the Needs attention strip and the empty state. Filters, key metrics and
 * the Getting started strip are later work.
 */
export function PortfolioBoard() {
  const brand = useBrand();
  const { teams, people, roles, countries, initiatives } = useRepositoryState();

  const initiativesByPhase = useMemo(() => {
    const byPhase = new Map<string, Initiative[]>(brand.process.map((phase) => [phase.id, []]));
    for (const initiative of initiatives) {
      if (initiative.status !== 'Active') continue;
      byPhase.get(currentPhaseId(initiative, brand.process))?.push(initiative);
    }
    return byPhase;
  }, [brand.process, initiatives]);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const totals = useMemo(
    () => new Map(initiatives.filter((i) => i.status === 'Active').map((i) => [i.id, grandEstimate(i, brand.process, people, { roles, countries })])),
    [initiatives, brand.process, people, roles, countries],
  );

  if (initiatives.length === 0) return <NoInitiatives />;

  return (
    <div className="px-8 py-6">
      <NeedsAttentionStrip />
      <div className="flex items-start gap-4 overflow-x-auto">
        {brand.process.map((phase) => {
          const phaseInitiatives = initiativesByPhase.get(phase.id) ?? [];
          const columnSum = phaseInitiatives.reduce((sum, i) => sum + (totals.get(i.id) ?? 0), 0);
          return (
            <div key={phase.id} className="min-w-55 flex-[1_0_220px] rounded-[10px] bg-surface-subtle p-3">
              <div className="mb-2.5 flex items-center justify-between px-0.5 text-sm font-semibold">
                <span>{phase.label}</span>
                <CompactAmount value={columnSum} prefix={`${phaseInitiatives.length} · `} className="font-medium text-text-secondary" />
              </div>
              <div className="flex flex-col gap-2">
                {phaseInitiatives.map((initiative) => (
                  <BoardCard
                    key={initiative.id}
                    initiative={initiative}
                    teamName={teamsById.get(initiative.teamId)?.name ?? 'Unknown team'}
                    total={totals.get(initiative.id) ?? 0}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
