import { useEffect, useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { useRateLimit, useRepository, useRepositoryState } from '../state/DataContext';
import { useSession } from '../state/SessionContext';
import { Button } from '@/components/ui/button';
import { ReplaceTokenField } from './ReplaceTokenField';

const number = new Intl.NumberFormat('en');
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "4,812 of 5,000 API requests left this hour, resets at 14:20" from the latest response, or "Not known yet" (§5.9). */
function requestsText(limit: ReturnType<typeof useRateLimit>): string {
  if (!limit) return 'Not known yet';
  return `${number.format(limit.remaining)} of ${number.format(limit.limit)} API requests left this hour, resets at ${clock.format(limit.resetsAt)}`;
}

/** Settings' Connection section (§5.9): who and what is connected, the request budget, replacing the token and Disconnect. */
export function ConnectionSection() {
  const brand = useBrand();
  const repository = useRepository();
  const session = useSession();
  const limit = useRateLimit();
  // Read on click, not on render: a pending edit has no state of its own to subscribe to, and a stale count would understate what is lost.
  useRepositoryState();
  const [confirming, setConfirming] = useState<number | null>(null);
  const { login, rememberLogin } = session;

  useEffect(() => {
    if (login) return;
    let cancelled = false;
    void repository.fetchLogin().then((found) => {
      if (found && !cancelled) rememberLogin(found);
    });
    return () => {
      cancelled = true;
    };
  }, [login, repository, rememberLogin]);

  function disconnect() {
    const unsaved = repository.unsavedChangeCount();
    if (unsaved === 0) session.disconnect();
    else setConfirming(unsaved);
  }

  const card = 'rounded-xl border border-border-default bg-surface-card px-4';
  const row = 'flex border-b border-border-default py-2.5 last:border-b-0';
  return (
    <section aria-labelledby="connection-heading" className="flex flex-col gap-4">
      <h2 id="connection-heading" className="m-0 text-lg">
        Connection
      </h2>
      <dl className={`m-0 ${card}`}>
        <div className={row}>
          <dt className="w-48 shrink-0 text-text-secondary">GitHub user</dt>
          <dd className="m-0">{login ?? 'Not known yet'}</dd>
        </div>
        <div className={row}>
          <dt className="w-48 shrink-0 text-text-secondary">Repository</dt>
          <dd className="m-0">
            {brand.github.owner}/{brand.github.repo} ({brand.github.dataBranch})
          </dd>
        </div>
        <div className={row}>
          <dt className="w-48 shrink-0 text-text-secondary">API requests</dt>
          <dd className="m-0">{requestsText(limit)}</dd>
        </div>
      </dl>

      <div className={`${card} flex flex-col gap-2 py-3`}>
        <h3 className="m-0 text-base">Replace token</h3>
        <p className="m-0 text-text-secondary">Paste a new token to swap it in. Your unsaved changes are kept.</p>
        <ReplaceTokenField />
      </div>

      <div className={`${card} flex flex-col gap-2 py-3`}>
        <h3 className="m-0 text-base">Disconnect</h3>
        <p className="m-0 text-text-secondary">Removes the token from this browser and opens the Connect screen.</p>
        {confirming === null ? (
          <div>
            <Button type="button" variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="destructive" onClick={session.disconnect}>
              Disconnect and discard {confirming} unsaved {confirming === 1 ? 'change' : 'changes'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
