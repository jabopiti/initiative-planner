import { useEffect, useState } from 'react';
import { tokenCreationUrl, tokenManagementUrl } from '../auth/tokenCreationUrl';
import { TOKEN_CHECK_MESSAGES, type TokenCheckResult } from '../auth/validateToken';
import { useBrand } from '../state/BrandContext';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { Button } from '@/components/ui/button';
import { ReplaceTokenField } from './ReplaceTokenField';
import { TokenSteps } from './TokenSteps';
import { WarningIcon } from './icons';

/** What the banner says for a rejected token, on top of §5.10's own "GitHub doesn't accept this token." (§3). */
const REJECTED_HINT = ' It has expired or been revoked; create a new one.';

/**
 * The app-wide read-only banner (§3, §9.9): shown on every page while sync has failed, naming the cause and
 * offering Retry. It cannot be dismissed while read-only, and disappears by itself the moment sync recovers —
 * automatically for the two causes §3 marks "Automatic" (GitHub unreachable, rate limited), or as soon as Retry
 * is clicked for any cause. It sits above `ConflictBanner`: read-only is the umbrella state, a same-field
 * conflict is a more specific thing nested under it.
 *
 * For "Access denied" it runs the §5.10 token check once, says which of its outcomes applies, and carries the
 * token field (§3 Sync failures), so a rejected token never locks the user out.
 */
export function ReadOnlyBanner() {
  const repository = useRepository();
  const brand = useBrand();
  const { readOnly } = useRepositoryState();
  const denied = readOnly?.cause === 'access-denied';
  const [diagnosis, setDiagnosis] = useState<TokenCheckResult | null>(null);

  useEffect(() => {
    if (!denied) {
      setDiagnosis(null);
      return;
    }
    let cancelled = false;
    void repository.checkAccess().then((result) => {
      if (cancelled) return;
      // A token that now works, or a check that could not reach GitHub, says nothing about the token: resend,
      // and the real cause (or the automatic retry for "unreachable") takes over.
      if (result.outcome === 'works' || result.outcome === 'classic-warning' || result.outcome === 'unreachable') {
        repository.retryAll();
        return;
      }
      setDiagnosis(result);
    });
    return () => {
      cancelled = true;
    };
  }, [denied, repository]);

  if (!readOnly) return null;

  const wrap = 'border-b border-border-default bg-warning-tint px-4 py-2 text-sm text-warning-text';

  if (denied) {
    const creationUrl = tokenCreationUrl(brand.github, brand.productName);
    const rejected = diagnosis?.outcome === 'invalid';
    const message = diagnosis
      ? TOKEN_CHECK_MESSAGES[diagnosis.outcome]() + (rejected ? REJECTED_HINT : '')
      : 'Checking your token…';
    const link = rejected
      ? { href: creationUrl, label: 'Create a token' }
      : diagnosis && diagnosis.outcome !== 'pending-approval'
        ? { href: tokenManagementUrl(brand.github), label: 'Edit this token in GitHub' }
        : null;
    return (
      <div className={`${wrap} flex flex-col gap-2`}>
        <span className="flex items-center gap-1.5" role="alert">
          <WarningIcon />
          {message}
        </span>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <ReplaceTokenField />
          {diagnosis && !rejected && (
            <Button type="button" variant="outline" size="sm" onClick={() => repository.retryAll()}>
              Retry
            </Button>
          )}
          {link && (
            <a href={link.href} target="_blank" rel="noreferrer" className="mt-1.5 underline">
              {link.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
        <details className="group">
          <summary className="cursor-pointer list-none underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show steps</span>
            <span className="hidden group-open:inline">Hide steps</span>
          </summary>
          <TokenSteps
            className="mt-2 gap-1.5 text-text-primary"
            first={
              <a href={creationUrl} target="_blank" rel="noreferrer" className="underline">
                Open GitHub token settings<span className="sr-only"> (opens in a new tab)</span>
              </a>
            }
          />
        </details>
      </div>
    );
  }

  return (
    <div className={`${wrap} flex items-center justify-between gap-3`} role="alert">
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
