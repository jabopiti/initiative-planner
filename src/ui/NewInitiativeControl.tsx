import { useEffect, useRef, useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { useNewInitiativeUI } from '../state/NewInitiativeUIContext';
import { navigate } from '../router/useHashRoute';
import { PlusIcon } from './icons';
import styles from './NewInitiativeControl.module.css';

const LAST_TEAM_KEY = 'initiative-planner/last-used-team';

/** The New initiative button (§5.1): opens a name field with a team selector; team defaults to last used or the only active team. */
export function NewInitiativeControl() {
  const repository = useRepository();
  const { teams } = useRepositoryState();
  const { open, setOpen } = useNewInitiativeUI();
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTeams = teams.filter((t) => t.active);

  useEffect(() => {
    if (!open) return;
    let lastUsed: string | null = null;
    try {
      lastUsed = localStorage.getItem(LAST_TEAM_KEY);
    } catch {
      // Local storage can be unavailable; falling through to the "only active team" default is fine.
    }
    const defaultTeam =
      (lastUsed && activeTeams.some((t) => t.id === lastUsed) ? lastUsed : null) ??
      (activeTeams.length === 1 ? activeTeams[0].id : '');
    setTeamId(defaultTeam);
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    setName('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !teamId) return;
    const initiative = await repository.createInitiative(name.trim(), teamId);
    try {
      localStorage.setItem(LAST_TEAM_KEY, teamId);
    } catch {
      // Non-essential convenience; losing it just means the default reverts next time.
    }
    close();
    navigate(`/initiatives/${initiative.id}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        data-new-initiative
        className={styles.trigger}
        onClick={() => setOpen(true)}
        disabled={activeTeams.length === 0}
      >
        <PlusIcon />
        New initiative
      </button>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <input
        ref={inputRef}
        className={styles.nameInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Initiative name"
      />
      <select className={styles.teamSelect} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
        {activeTeams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <button type="submit" className={styles.submit} disabled={!name.trim() || !teamId}>
        Create
      </button>
    </form>
  );
}
