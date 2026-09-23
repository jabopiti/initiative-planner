import { useMemo, useRef, useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { currentPhaseId } from '../data/processState';
import { EmptyState } from './EmptyState';
import { PlusIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Teams overview (§5.7), scoped to slice 003: name, size, per-phase initiative counts, and New team. */
export function TeamsOverview() {
  const brand = useBrand();
  const repository = useRepository();
  const { teams, initiatives } = useRepositoryState();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {teams.map((team) => {
          const teamPhaseCounts = phaseCountsByTeam.get(team.id);
          const phaseCounts = brand.process.map((phase) => ({
            phase,
            count: teamPhaseCounts?.get(phase.id) ?? 0,
          }));
          return (
            <div
              key={team.id}
              className={`rounded-[10px] border border-border-default bg-surface-card p-4 ${team.active ? '' : 'opacity-55'}`}
            >
              <h2 className="m-0 mb-1 text-base">{team.name}</h2>
              <p className="m-0 mb-3 text-sm text-text-secondary">0 members</p>
              <div className="flex flex-wrap gap-1.5">
                {phaseCounts.map(({ phase, count }) => (
                  <span
                    key={phase.id}
                    className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-text-secondary"
                  >
                    {phase.label}: {count}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
