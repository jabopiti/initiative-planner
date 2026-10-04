import { useEffect, useRef, useState } from 'react';
import { newId } from '../data/ids';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { navigate } from '../router/useHashRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TeamSelect } from './TeamSelect';
import { Page } from './Page';
import { Badge } from '@/components/ui/badge';

const HIGHLIGHT = 'border-brand-accent bg-brand-accent-tint';
const GUIDANCE_ID = 'new-initiative-guidance';

/**
 * The New initiative draft page (§5.1, §5.4): the name is typed where the initiative's page will be.
 * Nothing is written until Create initiative is chosen, which needs a name and a team; then the
 * initiative is created and its page replaces this one. Esc discards. The next thing to fill in is
 * highlighted and also named in the guidance line, so colour never carries it alone.
 */
export function NewInitiativeDraft({ presetTeamId }: { presetTeamId?: string } = {}) {
  const repository = useRepository();
  const { teams } = useRepositoryState();
  const [name, setName] = useState('');
  // On the window, so Esc works wherever focus is; a dropdown that Esc just closed has already claimed the key.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) navigate('/portfolio', { replace: true });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  // The team page presets its own team (§5.8); a team that is gone or inactive is not chosen for the user.
  const [picked, setPicked] = useState<string | null>(null);
  const teamId = picked ?? (teams.some((t) => t.id === presetTeamId && t.active) ? presetTeamId! : '');
  const [draftId] = useState(newId); // kept across retries, so a failed creation is the same file when tried again
  const creating = useRef(false); // set on the first create, so a double click or Enter makes one commit
  const teamTrigger = useRef<HTMLButtonElement>(null);

  // Leaving the draft after a failed creation ends that failure: nothing will retry it (a saved one is left alone).
  useEffect(() => {
    return () => repository.discardFailedCreation(draftId);
  }, [repository, draftId]);

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
    try {
      const initiative = await repository.createInitiative(name.trim(), teamId, undefined, draftId);
      navigate(`/initiatives/${initiative.id}`, { replace: true });
    } catch {
      creating.current = false; // the top bar says why it wasn't saved; the draft stays for another try
    }
  }

  return (
    <Page>
      <div className="mx-auto max-w-detail">
        <h1 className="sr-only">New initiative</h1>
        <div className="flex items-center gap-3">
          <Input
            autoFocus
            className={`h-auto min-w-0 flex-1 px-3 py-1.5 text-display ${nextStep === 'name' ? HIGHLIGHT : ''}`}
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
          <TeamSelect
            ref={teamTrigger}
            teams={teams}
            value={teamId}
            onValueChange={setPicked}
            aria-describedby={GUIDANCE_ID}
            className={nextStep === 'team' ? HIGHLIGHT : ''}
          />
          <Badge variant="subtle">Draft</Badge>
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
        <p id={GUIDANCE_ID} role="status" className="mt-3 mb-0 text-caption text-text-secondary">
          {guidance}
        </p>
      </div>
    </Page>
  );
}
