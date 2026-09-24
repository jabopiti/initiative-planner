import { useRepositoryState } from '../state/DataContext';
import { navigate } from '../router/useHashRoute';
import { Button } from '@/components/ui/button';
import { PlusIcon, ReactivateTeamIcon } from './icons';

/**
 * The New initiative button (§5.1): opens the draft page, where the name is typed in place (§5.4).
 * With no active team it names the missing prerequisite instead and opens the Teams overview (§9.4),
 * so it is never a dead end.
 */
export function NewInitiativeControl() {
  const { teams } = useRepositoryState();
  const noTeam = teams.length === 0;
  const noActiveTeam = !teams.some((t) => t.active);
  return (
    <Button type="button" data-new-initiative onClick={() => navigate(noActiveTeam ? '/teams' : '/initiatives/new')}>
      {noActiveTeam && !noTeam ? <ReactivateTeamIcon /> : <PlusIcon />}
      {noTeam ? 'Create a team' : noActiveTeam ? 'Reactivate a team' : 'New initiative'}
    </Button>
  );
}
