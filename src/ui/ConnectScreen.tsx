import { useState, type ClipboardEvent } from 'react';
import { useBrand } from '../state/BrandContext';
import { checkToken, repoLabel, TOKEN_CHECK_MESSAGES, type TokenCheckResult } from '../auth/validateToken';
import { tokenCreationUrl, tokenManagementUrl } from '../auth/tokenCreationUrl';
import { tokenStore } from '../auth/tokenStore';
import { ChevronDown, KeyRound, ShieldCheck } from 'lucide-react';
import { TokenSteps } from './TokenSteps';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cardClass } from './cardClass';

const MESSAGE_STYLES: Record<TokenCheckResult['outcome'], string> = {
  works: 'bg-met-tint text-met-text',
  'classic-warning': 'bg-warning-tint text-warning-text',
  'cannot-see-repo': 'bg-alarm-tint text-alarm-text',
  'read-only': 'bg-alarm-tint text-alarm-text',
  'pending-approval': 'bg-alarm-tint text-alarm-text',
  invalid: 'bg-alarm-tint text-alarm-text',
  unreachable: 'bg-warning-tint text-warning-text',
};

export function ConnectScreen({ onConnected }: { onConnected: (token: string, remember: boolean, login: string, classic: boolean) => void }) {
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<TokenCheckResult | null>(null);
  const brand = useBrand();
  const repo = repoLabel(brand.github);
  // Off on a shared origin, where other sites could read a remembered token (§3, Authentication).
  const canRemember = tokenStore.canRemember();

  async function connect(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || checking) return;
    setChecking(true);
    setResult(null);
    const outcome = await checkToken(brand.github, trimmed);
    setChecking(false);
    setResult(outcome);
    if (outcome.outcome === 'works' || outcome.outcome === 'classic-warning') {
      onConnected(trimmed, remember, outcome.login, outcome.outcome === 'classic-warning');
    }
  }

  // A pasted token is checked at once, with the Remember me choice as it stands (§5.10); typing needs Connect.
  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').trim();
    if (!pasted) return;
    event.preventDefault();
    setToken(pasted);
    void connect(pasted);
  }

  function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    void connect(token);
  }

  const tokenSettingsUrl = tokenCreationUrl(brand.github, brand.productName);
  const tokenManagementLink = tokenManagementUrl(brand.github);
  const apiHost = new URL(brand.github.apiBaseUrl).host;
  const isError = result !== null && result.outcome !== 'works' && result.outcome !== 'classic-warning';
  const panelClass = `${cardClass} p-6`;
  const newTab = <span className="sr-only"> (opens in a new tab)</span>;

  return (
    <main className="mx-auto flex w-full max-w-connect flex-col gap-4 px-4 py-12">
      <section className={`${panelClass} border-2 border-brand-accent`} aria-labelledby="connect-heading">
        <h1 id="connect-heading" className="m-0 mb-1 text-display">
          Connect to {brand.productName}
        </h1>
        <p className="m-0 mb-5 text-text-secondary">Paste your GitHub token to continue.</p>

        <form className="flex flex-col gap-3" onSubmit={handleConnect}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="token-field">GitHub token</Label>
            <div className="flex gap-2">
              <Input
                id="token-field"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onPaste={onPaste}
                placeholder="github_pat_..."
                className="flex-1"
              />
              <Button type="submit" disabled={checking || !token.trim()}>
                {checking ? 'Checking…' : 'Connect'}
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="remember-field"
              checked={remember && canRemember}
              disabled={!canRemember}
              aria-describedby={canRemember ? undefined : 'remember-unavailable'}
              onCheckedChange={(checked) => setRemember(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="remember-field">Remember me on this device</Label>
          </div>
          {!canRemember && (
            <p id="remember-unavailable" className="m-0 -mt-1 pl-6 text-caption text-text-secondary">
              Not available here: this copy runs on github.io, where other sites can read what it saves. It&rsquo;s
              kept for this tab only.
            </p>
          )}
        </form>

        {result && (
          <div
            className={`mt-4 rounded-lg px-3 py-2.5 text-body ${MESSAGE_STYLES[result.outcome]}`}
            role={isError ? 'alert' : 'status'}
          >
            {TOKEN_CHECK_MESSAGES[result.outcome]({ login: 'login' in result ? result.login : undefined, repo })}
            {result.outcome === 'invalid' && (
              <>
                {' '}
                <a href={tokenSettingsUrl} target="_blank" rel="noreferrer" className="underline">
                  Create a new token{newTab}
                </a>
              </>
            )}
          </div>
        )}
      </section>

      <section className={panelClass} aria-labelledby="guide-heading">
        <h2 id="guide-heading" className="m-0 mb-3 text-title">
          No token yet? Create one in 4 steps
        </h2>
        <TokenSteps
          className="text-text-secondary"
          first={
            <a
              className="inline-block rounded-lg bg-brand-accent-tint px-3 py-1.5 font-medium text-brand-accent-text no-underline"
              href={tokenSettingsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open GitHub token settings{newTab}
            </a>
          }
        />
        <p className="m-0 mt-3 text-text-secondary">Then select Generate token, copy it and paste it above.</p>
        <p className="m-0 mt-4 flex items-start gap-2 rounded-lg bg-surface-subtle px-3 py-2.5 text-body text-text-primary">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span>
            <strong className="font-medium">Tip:</strong> GitHub shows the token only once. Save it in your password
            manager so you can paste it again later.
          </span>
        </p>
      </section>

      <details className="group rounded-xl bg-met-tint">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-6 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="size-5 shrink-0 text-met-text" aria-hidden="true" />
          <span className="flex-1">How we protect your token</span>
          <ChevronDown
            className="size-5 shrink-0 text-text-secondary transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <ul className="m-0 flex list-disc flex-col gap-2 px-6 pb-6 pl-11 text-caption text-text-primary marker:text-text-secondary">
          <li>
            <strong className="font-medium">Stays in your browser.</strong> Kept in this tab only and cleared when you
            close it{canRemember && <>, unless you tick &ldquo;Remember me&rdquo;</>}. There is no server in between.
          </li>
          <li>
            <strong className="font-medium">Goes only to GitHub.</strong> Sent to {apiHost} and nowhere else. A strict
            content security policy blocks other connections, inline scripts and <code>eval</code>, and the app refuses to
            load inside another page.
          </li>
          <li>
            <strong className="font-medium">Never stored with your data.</strong> It is not written to the repository,
            the dataset or any commit.
          </li>
          <li>
            <strong className="font-medium">Limited by design.</strong> A fine-grained token reaches {repo} only,
            with Contents access, and expires after a year.{' '}
            <a href={tokenManagementLink} target="_blank" rel="noreferrer" className="underline">
              Revoke it in GitHub any time{newTab}
            </a>
            .
          </li>
          {canRemember ? (
            <li>
              <strong className="font-medium">One thing to know.</strong> The browser keeps it unencrypted, so tick
              &ldquo;Remember me&rdquo; only on a device you trust.
            </li>
          ) : (
            <li>
              <strong className="font-medium">Why there is no Remember me here.</strong> This copy runs on github.io,
              an address shared with other sites, which could read a token saved on the device.
            </li>
          )}
        </ul>
      </details>
    </main>
  );
}
