import { useRepositoryState } from '../state/DataContext';
import { navigate } from '../router/useHashRoute';
import { EmptyState } from './EmptyState';

/** The empty state of the Portfolio and the Initiatives table (§9.4): the reason names the missing prerequisite, so the one action always works. */
export function NoInitiatives() {
  const { teams } = useRepositoryState();
  const noTeam = teams.length === 0;
  const noActiveTeam = !teams.some((t) => t.active);
  return (
    <div className="px-8 py-6">
      <EmptyState
        line="No initiatives yet"
        reason={noTeam ? 'No teams yet.' : noActiveTeam ? 'All your teams are inactive.' : undefined}
        actionLabel={noTeam ? 'Create a team' : noActiveTeam ? 'Reactivate a team' : 'Create your first initiative'}
        onAction={() => navigate(noActiveTeam ? '/teams' : '/initiatives/new')}
      />
    </div>
  );
}
