import { useMemo } from 'react';
import { useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { currentPhaseId } from '../data/processState';
import { sortRows } from '../data/sortRows';
import { navigate } from '../router/useHashRoute';
import type { Team } from '../data/types';
import { SortableHeader } from './SortableHeader';
import { openRowProps } from './openRowProps';
import { TruncatedText } from './TruncatedText';
import { useTableSort } from './tableSort';
import { PlusIcon } from './icons';
import { Button } from '@/components/ui/button';

/** The team page's Initiatives list (§5.8): every status, phase in process order then name, and a New initiative that presets the team (§5.1). */
export function TeamInitiatives({ team }: { team: Team }) {
  const { process } = useBrand();
  const { initiatives } = useRepositoryState();
  const sort = useTableSort('phase');

  const rows = useMemo(
    () =>
      sortRows(
        initiatives
          .filter((i) => i.teamId === team.id)
          .map((initiative) => {
            const phaseId = currentPhaseId(initiative, process);
            return { initiative, phaseId, phaseLabel: process.find((p) => p.id === phaseId)?.label ?? phaseId };
          }),
        {
          name: (r) => r.initiative.name,
          phase: (r) => process.findIndex((p) => p.id === r.phaseId),
          status: (r) => r.initiative.status,
        },
        sort.key,
        sort.dir,
        'name',
      ),
    [initiatives, team.id, process, sort.key, sort.dir],
  );

  const start = () => navigate(`/initiatives/new?team=${encodeURIComponent(team.id)}`);

  return (
    <section aria-label="Initiatives" className="mt-8 max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-base">Initiatives</h2>
        {team.active && rows.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={start}>
            <PlusIcon />
            New initiative
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="m-0 py-3 text-body-lg text-text-secondary">
          {team.active ? (
            <>
              No initiatives yet —{' '}
              <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-brand-accent-text underline" onClick={start}>
                New initiative
              </button>
            </>
          ) : (
            'No initiatives.'
          )}
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-text-secondary">
              <SortableHeader label="Name" sortKey="name" sort={sort} />
              <SortableHeader label="Phase" sortKey="phase" sort={sort} />
              <SortableHeader label="Status" sortKey="status" sort={sort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.initiative.id} className="cursor-pointer border-b border-border-default" {...openRowProps(() => navigate(`/initiatives/${r.initiative.id}`))}>
                <td className="px-3 py-2">
                  <a href={`#/initiatives/${r.initiative.id}`} className="font-medium text-inherit no-underline hover:underline">
                    <TruncatedText text={r.initiative.name} />
                  </a>
                </td>
                <td className="px-3 py-2">{r.phaseLabel}</td>
                <td className="px-3 py-2">{r.initiative.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
