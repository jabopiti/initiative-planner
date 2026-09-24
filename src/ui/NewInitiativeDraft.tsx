import { useRef, useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { navigate } from '../router/useHashRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const HIGHLIGHT = 'border-brand-accent bg-brand-accent-tint';
const GUIDANCE_ID = 'new-initiative-guidance';

/**
 * The New initiative draft page (§5.1, §5.4): the name is typed where the initiative's page will be.
 * Nothing is written until Create initiative is chosen, which needs a name and a team; then the
 * initiative is created and its page replaces this one. Esc discards. The next thing to fill in is
 * highlighted and also named in the guidance line, so colour never carries it alone.
 */
export function NewInitiativeDraft() {
  const repository = useRepository();
  const { teams, status } = useRepositoryState();
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const creating = useRef(false); // set on the first create, so a double click or Enter makes one commit
  const teamTrigger = useRef<HTMLButtonElement>(null);

  const activeTeams = teams.filter((t) => t.active);
  const hasName = name.trim() !== '';
  const nextStep = !hasName ? 'name' : !teamId ? 'team' : 'create';
  const guidance = {
    name: 'Next: name the initiative.',
    team: 'Next: choose a team.',
    create: 'Ready. Create the initiative to start planning.',
  }[nextStep];

  async function create() {
    if (!hasName || !teamId || creating.current) return;
    creating.current = true;
    const initiative = await repository.createInitiative(name.trim(), teamId);
    navigate(`/initiatives/${initiative.id}`, { replace: true });
  }

  if (status === 'loading') return null;

  return (
    <div
      className="max-w-[720px] p-8"
      onKeyDown={(e) => {
        // A dropdown that Esc just closed has already claimed the key.
        if (e.key === 'Escape' && !e.defaultPrevented) navigate('/portfolio');
      }}
    >
      <div className="flex items-center gap-3">
        <Input
          autoFocus
          className={`h-auto min-w-0 flex-1 px-3 py-1.5 text-2xl font-semibold md:text-2xl ${nextStep === 'name' ? HIGHLIGHT : ''}`}
          aria-label="Initiative name"
          aria-describedby={GUIDANCE_ID}
          placeholder="Name this initiative"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (teamId) void create();
            else if (hasName) teamTrigger.current?.focus();
          }}
        />
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger
            ref={teamTrigger}
            size="sm"
            aria-label="Team"
            aria-describedby={GUIDANCE_ID}
            className={nextStep === 'team' ? HIGHLIGHT : ''}
          >
            <SelectValue placeholder="Select team" />
          </SelectTrigger>
          <SelectContent>
            {activeTeams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-text-secondary">Draft</span>
        <Button
          type="button"
          size="sm"
          disabled={nextStep !== 'create'}
          className={nextStep === 'create' ? 'ring-2 ring-brand-accent ring-offset-2' : ''}
          onClick={() => void create()}
        >
          Create initiative
        </Button>
      </div>
      <p id={GUIDANCE_ID} role="status" className="mt-3 mb-0 text-sm text-text-secondary">
        {guidance}
      </p>
    </div>
  );
}
