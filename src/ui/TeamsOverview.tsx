import { useMemo, useRef, useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { currentPhaseId } from '../data/processState';
import { EmptyState } from './EmptyState';
import { PlusIcon } from './icons';
import { CopyButton } from './CopyButton';
import { SortableHeader } from './SortableHeader';
import { TruncatedText } from './TruncatedText';
import { sortRows, useTableSort } from './tableSort';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Teams overview (§5.7), scoped to slice 003: name, size, per-phase initiative counts, and New team. */
export function TeamsOverview() {
  const brand = useBrand();
  const repository = useRepository();
  const { teams, initiatives, memberships } = useRepositoryState();
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

  const rows = useMemo(
    () =>
      teams.map((team) => ({
        team,
        members: memberships.filter((m) => m.teamId === team.id && m.active).length,
        counts: brand.process.map((phase) => phaseCountsByTeam.get(team.id)?.get(phase.id) ?? 0),
      })),
    [teams, memberships, brand.process, phaseCountsByTeam],
  );

  const sorted = useMemo(() => {
    const columns: Record<string, (r: (typeof rows)[number]) => string | number> = {
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
            <SortableHeader label="Name" sortKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
            <SortableHeader label="Members" sortKey="members" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
            {brand.process.map((phase) => (
              <SortableHeader
                key={phase.id}
                label={phase.label}
                sortKey={`phase:${phase.id}`}
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
                align="right"
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ team, members, counts }) => (
            <tr key={team.id} className={`border-b border-border-default ${team.active ? '' : 'text-text-secondary'}`}>
              <td className="px-3 py-2 font-medium">
                <TruncatedText text={team.name}>
                  <a href={`#/teams/${team.id}`} className="text-inherit no-underline">
                    {team.name}
                  </a>
                </TruncatedText>
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
