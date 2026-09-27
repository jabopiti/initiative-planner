import { useRepository, useRepositoryState } from '../state/DataContext';
import { Button } from '@/components/ui/button';
import { WarningIcon } from './icons';

/**
 * The app-wide read-only banner (§3, §9.9): shown on every page while sync has failed, naming the cause and
 * offering Retry. It cannot be dismissed while read-only, and disappears by itself the moment sync recovers —
 * automatically for the two causes §3 marks "Automatic" (GitHub unreachable, rate limited), or as soon as Retry
 * is clicked for any cause. It sits above `ConflictBanner`: read-only is the umbrella state, a same-field
 * conflict is a more specific thing nested under it.
 */
export function ReadOnlyBanner() {
  const repository = useRepository();
  const { readOnly } = useRepositoryState();

  if (!readOnly) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-border-default bg-warning-tint px-4 py-2 text-sm text-warning-text"
      role="alert"
    >
      <span className="flex items-center gap-1.5">
        <WarningIcon />
        {readOnly.message}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => repository.retryAll()}>
        Retry
      </Button>
    </div>
  );
}
