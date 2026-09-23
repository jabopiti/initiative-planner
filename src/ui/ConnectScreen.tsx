import { useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { checkToken, TOKEN_CHECK_MESSAGES, type TokenCheckResult } from '../auth/validateToken';
import { tokenCreationUrl } from '../auth/tokenCreationUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MESSAGE_STYLES: Record<TokenCheckResult['outcome'], string> = {
  works: 'bg-met-tint text-met-text',
  'classic-warning': 'bg-warning-tint text-warning-text',
  'cannot-see-repo': 'bg-alarm-tint text-alarm-text',
  'read-only': 'bg-alarm-tint text-alarm-text',
  'pending-approval': 'bg-alarm-tint text-alarm-text',
  invalid: 'bg-alarm-tint text-alarm-text',
};

export function ConnectScreen({ onConnected }: { onConnected: (token: string, remember: boolean) => void }) {
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<TokenCheckResult | null>(null);
  const brand = useBrand();
  const repoLabel = `${brand.github.owner}/${brand.github.repo}`;

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setChecking(true);
    setResult(null);
    const outcome = await checkToken(brand.github, token.trim());
    setChecking(false);
    setResult(outcome);
    if (outcome.outcome === 'works' || outcome.outcome === 'classic-warning') {
      onConnected(token.trim(), remember);
    }
  }

  async function copyRepoName() {
    try {
      await navigator.clipboard.writeText(repoLabel);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the name is also shown as plain text.
    }
  }

  const tokenSettingsUrl = tokenCreationUrl(brand.github, brand.productName);
  const isError = result !== null && result.outcome !== 'works' && result.outcome !== 'classic-warning';

  return (
    <div className="flex min-h-full items-start justify-center px-4 py-16">
      <main className="w-full max-w-[560px] rounded-xl border border-border-default bg-surface-card p-8">
        <h1 className="m-0 mb-2 text-[22px]">Connect to {brand.productName}</h1>
        <p className="m-0 mb-6 text-text-secondary">Paste your GitHub token to continue.</p>

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
                placeholder="github_pat_..."
                className="flex-1"
              />
              <Button type="submit" disabled={checking || !token.trim()}>
                {checking ? 'Checking…' : 'Connect'}
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <input
              id="remember-field"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              aria-describedby="remember-hint"
              className="mt-0.5 size-4 accent-brand-accent"
            />
            <div className="flex flex-col">
              <Label htmlFor="remember-field">Remember me on this device</Label>
              <span id="remember-hint" className="text-sm text-text-secondary">
                Off: you sign in again when you close this tab.
              </span>
            </div>
          </div>
        </form>

        {result && (
          <div
            className={`mt-4 rounded-lg px-3 py-2.5 text-sm ${MESSAGE_STYLES[result.outcome]}`}
            role={isError ? 'alert' : 'status'}
          >
            {TOKEN_CHECK_MESSAGES[result.outcome]('login' in result ? result.login : undefined)}
            {result.outcome === 'classic-warning' && (
              <>
                {' '}
                — a classic token reaches all your repositories.{' '}
                <a href={tokenSettingsUrl} target="_blank" rel="noreferrer" className="underline">
                  Create a fine-grained one<span className="sr-only"> (opens in a new tab)</span>
                </a>
                .
              </>
            )}
          </div>
        )}

        <section className="mt-8" aria-labelledby="guide-heading">
          <h2 id="guide-heading" className="m-0 mb-3 text-base">
            No token yet? Create one in 4 steps
          </h2>
          <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-text-secondary marker:font-semibold marker:text-text-primary">
            <li>
              <a
                className="inline-block rounded-lg bg-brand-accent-tint px-3 py-1.5 font-semibold text-brand-accent-text no-underline"
                href={tokenSettingsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open GitHub token settings<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            <li>Set the expiry to 1 year.</li>
            <li>
              Under Repository access, choose &ldquo;Only select repositories&rdquo; and pick{' '}
              <code className="rounded bg-surface-subtle px-1.5 py-0.5">{repoLabel}</code>{' '}
              <Button type="button" variant="outline" size="xs" onClick={copyRepoName} aria-label={`Copy ${repoLabel}`}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <span className="sr-only" aria-live="polite">
                {copied ? 'Copied to clipboard' : ''}
              </span>
            </li>
            <li>Under Permissions, set Contents to Read and write. Leave everything else at No access.</li>
          </ol>
          <p className="m-0 mt-3 text-text-secondary">Then select Generate token, copy it and paste it above.</p>
        </section>

        <section className="mt-8 rounded-lg bg-surface-subtle px-4 py-3" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="m-0 mb-2 text-sm">
            How we handle your token
          </h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-text-secondary">
            <li>Kept in this tab only, unless you tick &ldquo;Remember me on this device&rdquo;.</li>
            <li>Sent only to {new URL(brand.github.apiBaseUrl).host}. Never saved to the repository.</li>
            <li>Works for {repoLabel} only.</li>
            <li>Not encrypted in your browser, so use a device you trust. Revoke it any time in GitHub.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
