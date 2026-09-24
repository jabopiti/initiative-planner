import { useRepositoryState } from '../state/DataContext';
import { navigate } from '../router/useHashRoute';
import { Button } from '@/components/ui/button';
import { PlusIcon } from './icons';

/** The New initiative button (§5.1): opens the draft page, where the name is typed in place (§5.4). */
export function NewInitiativeControl() {
  const { teams } = useRepositoryState();
  return (
    <Button type="button" data-new-initiative onClick={() => navigate('/initiatives/new')} disabled={!teams.some((t) => t.active)}>
      <PlusIcon />
      New initiative
    </Button>
  );
}
