import { useRef, useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { navigate } from '../router/useHashRoute';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const LAST_TEAM_KEY = 'initiative-planner/last-used-team';

function readLastTeam(): string | null {
  try {
    return localStorage.getItem(LAST_TEAM_KEY);
  } catch {
    return null; // Local storage can be unavailable; the "only active team" default still applies.
  }
}

/**
 * The New initiative draft page (§5.1, §5.4): the name is typed where the initiative's page will be.
 * Nothing is written until there is a name and a team; then the initiative is created and its page
 * replaces this one. Esc discards.
 */
export function NewInitiativeDraft() {
  const repository = useRepository();
  const { teams, status } = useRepositoryState();
  const [name, setName] = useState('');
  const [chosenTeam, setChosenTeam] = useState<string | null>(null);
  const [lastUsed] = useState(readLastTeam);
  const finished = useRef(false); // set once saved or discarded, so a late blur does nothing
  const selectOpen = useRef(false);
  const pickingTeam = useRef(false); // pointer is on the team pill: Safari doesn't focus buttons on click

  const activeTeams = teams.filter((t) => t.active);
  const teamId =
    chosenTeam ??
    (lastUsed && activeTeams.some((t) => t.id === lastUsed) ? lastUsed : null) ??
    (activeTeams.length === 1 ? activeTeams[0].id : '');

  async function save(forTeam: string = teamId) {
    const trimmed = name.trim();
    if (!trimmed || !forTeam || finished.current) return;
    finished.current = true;
    const initiative = await repository.createInitiative(trimmed, forTeam);
    try {
      localStorage.setItem(LAST_TEAM_KEY, forTeam);
    } catch {
      // Non-essential convenience; losing it just means the default reverts next time.
    }
    navigate(`/initiatives/${initiative.id}`, { replace: true });
  }

  if (status === 'loading') return null;

  return (
    <div
      className="max-w-[720px] p-8"
      onBlur={(e) => {
        if (selectOpen.current || pickingTeam.current) return;
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        void save();
      }}
    >
      <div className="flex items-center gap-3">
        <Input
          autoFocus
          className="h-auto min-w-0 flex-1 px-3 py-1.5 text-2xl font-semibold md:text-2xl"
          aria-label="Initiative name"
          placeholder="Name this initiative"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              finished.current = true;
              navigate('/portfolio');
            }
          }}
        />
        <div onPointerDownCapture={() => (pickingTeam.current = true)}>
          <Select
            value={teamId}
            onValueChange={(value) => {
              setChosenTeam(value);
              void save(value);
            }}
            onOpenChange={(open) => {
              selectOpen.current = open;
              pickingTeam.current = false;
            }}
          >
            <SelectTrigger size="sm" aria-label="Team">
              <SelectValue placeholder="Choose team" />
            </SelectTrigger>
            <SelectContent>
              {activeTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-text-secondary">Draft</span>
      </div>
    </div>
  );
}
