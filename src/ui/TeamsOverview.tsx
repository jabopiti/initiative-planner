import { useMemo, useRef, useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { currentPhaseId } from '../data/processState';
import { EmptyState } from './EmptyState';
import { PlusIcon } from './icons';
import styles from './TeamsOverview.module.css';

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
      <div className={styles.page}>
        <EmptyState line="No teams yet" actionLabel="Create a team" onAction={startCreating} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Teams</h1>
        {creating ? (
          <form
            className={styles.newTeamForm}
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCreating(false);
            }}
          >
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              className={styles.newTeamInput}
            />
            <button type="submit" className={styles.newTeamSubmit} disabled={!name.trim()}>
              Create
            </button>
          </form>
        ) : (
          <button type="button" className={styles.newTeamButton} onClick={startCreating}>
            <PlusIcon />
            New team
          </button>
        )}
      </div>

      <div className={styles.grid}>
        {teams.map((team) => {
          const teamPhaseCounts = phaseCountsByTeam.get(team.id);
          const phaseCounts = brand.process.map((phase) => ({
            phase,
            count: teamPhaseCounts?.get(phase.id) ?? 0,
          }));
          return (
            <div key={team.id} className={team.active ? styles.card : styles.cardInactive}>
              <h2 className={styles.cardName}>{team.name}</h2>
              <p className={styles.cardMeta}>0 members</p>
              <div className={styles.phaseChips}>
                {phaseCounts.map(({ phase, count }) => (
                  <span key={phase.id} className={styles.phaseChip}>
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
