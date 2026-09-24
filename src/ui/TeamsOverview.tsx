import { useMemo, useRef, useState } from 'react';
import { useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { activeLoads, teamCapacity, teamHasCapacityWarning } from '../data/capacity';
import { localToday } from '../data/dates';
import { currentPhaseId } from '../data/processState';
import { activeMembers } from '../data/teamMembers';
import { navigate } from '../router/useHashRoute';
import { EmptyState } from './EmptyState';
import { PlusIcon, WarningIcon } from './icons';
import { CopyButton } from './CopyButton';
import { SortableHeader } from './SortableHeader';
import { TruncatedText } from './TruncatedText';
import { sortRows, useTableSort, type SortValue } from './tableSort';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Teams overview (§5.7): name, size, per-phase initiative counts, and New team. */
export function TeamsOverview() {
  const brand = useBrand();
  const repository = useRepository();
  const { teams, initiatives, memberships, people } = useRepositoryState();
  const changed = useIsChangedByOthers();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const sort = useTableSort('name');

  const phaseCountsByTeam = useMemo(() => {
    const byTeam = new Map<string, Map<string, number>>();
    for (const initiative of initiatives) {
      if (initiative.status !== 'Active') continue;
      const phaseId = currentPhaseId(initiative, brand.process);
      const counts = byTeam.get(initiative.teamId) ?? new Map<string, number>();
      counts.set(phaseId, (counts.get(phaseId) ?? 0) + 1);
      byTeam.set(initiative.teamId, counts);
    }
    return byTeam;
  }, [brand.process, initiatives]);

  const today = localToday();
  const rows = useMemo(() => {
    const data = { initiatives, teams, people, memberships, process: brand.process, today };
    const loads = activeLoads(data);
    return teams.map((team) => ({
      team,
      members: activeMembers(team.id, memberships, people).length,
      capacityWarning: teamHasCapacityWarning(teamCapacity(team.id, data, loads)),
      counts: brand.process.map((phase) => phaseCountsByTeam.get(team.id)?.get(phase.id) ?? 0),
    }));
  }, [teams, initiatives, memberships, people, brand.process, phaseCountsByTeam, today]);

  const sorted = useMemo(() => {
    const columns: Record<string, (r: (typeof rows)[number]) => SortValue> = {
      name: (r) => r.team.name,
      members: (r) => r.members,
    };
    brand.process.forEach((phase, i) => {
      columns[`phase:${phase.id}`] = (r) => r.counts[i];
    });
    return sortRows(rows, columns, sort.key in columns ? sort.key : 'name', sort.dir, 'name');
  }, [rows, brand.process, sort.key, sort.dir]);

  function copyData() {
    return {
      headers: ['Name', 'Members', ...brand.process.map((phase) => phase.label)],
      rows: sorted.map((r) => [r.team.name, String(r.members), ...r.counts.map(String)]),
    };
  }

  function startCreating() {
    setCreating(true);
    setName('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    repository.createTeam(name.trim());
    setCreating(false);
    setName('');
  }

  if (teams.length === 0 && !creating) {
    return (
      <div className="px-8 py-6">
        <EmptyState line="No teams yet" actionLabel="Create a team" onAction={startCreating} />
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-xl">Teams</h1>
        <div className="flex items-center gap-2">
        {teams.length > 0 && <CopyButton getData={copyData} noun={['team', 'teams']} />}
        {creating ? (
          <form
            className="flex gap-1.5"
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCreating(false);
            }}
          >
            <Input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
            <Button type="submit" disabled={!name.trim()}>
              Create
            </Button>
          </form>
        ) : (
          <Button type="button" onClick={startCreating}>
            <PlusIcon />
            New team
          </Button>
        )}
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-text-secondary">
            <SortableHeader label="Name" sortKey="name" sort={sort} />
            <SortableHeader label="Members" sortKey="members" sort={sort} align="right" />
            {brand.process.map((phase) => (
              <SortableHeader
                key={phase.id}
                label={phase.label}
                sortKey={`phase:${phase.id}`}
                sort={sort}
                align="right"
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ team, members, counts, capacityWarning }) => (
            <tr
              key={team.id}
              className={`cursor-pointer border-b border-border-default transition-colors duration-500 ${changed('teams.json', [{ id: team.id }]) ? 'bg-met-tint' : ''} ${team.active ? '' : 'text-text-secondary'}`}
              onClick={(e) => {
                // A click on the name link is the link's own (Cmd-click opens a new tab, without also leaving this one); the warning marker only shows its tooltip.
                if (!(e.target as HTMLElement).closest('a, [data-row-action]')) navigate(`/teams/${team.id}`);
              }}
            >
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-2">
                  <TruncatedText text={team.name}>
                    <a href={`#/teams/${team.id}`} className="text-inherit no-underline">
                      {team.name}
                    </a>
                  </TruncatedText>
                  {capacityWarning && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span role="img" aria-label="Capacity warning" tabIndex={0} data-row-action className="shrink-0 text-warning-text">
                          <WarningIcon width={16} height={16} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>A member has a capacity warning</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right">{members}</td>
              {counts.map((count, i) => (
                <td key={brand.process[i].id} className="px-3 py-2 text-right">
                  {count}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
