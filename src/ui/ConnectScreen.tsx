import { useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { checkToken, TOKEN_CHECK_MESSAGES, type TokenCheckResult } from '../auth/validateToken';
import { tokenCreationUrl, tokenManagementUrl } from '../auth/tokenCreationUrl';
import { ChevronDown, KeyRound, ShieldCheck } from 'lucide-react';
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
    if (!token.trim() || checking) return;
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
  const tokenManagementLink = tokenManagementUrl(brand.github);
  const apiHost = new URL(brand.github.apiBaseUrl).host;
  const isError = result !== null && result.outcome !== 'works' && result.outcome !== 'classic-warning';
  const cardClass = 'rounded-xl border border-border-default bg-surface-card p-6';
  const newTab = <span className="sr-only"> (opens in a new tab)</span>;

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-12">
      <section className={`${cardClass} border-2 border-brand-accent`} aria-labelledby="connect-heading">
        <h1 id="connect-heading" className="m-0 mb-1 text-[22px]">
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
              className="mt-0.5 size-4 accent-brand-accent"
            />
            <Label htmlFor="remember-field">Remember me on this device</Label>
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
                  Create a fine-grained one{newTab}
                </a>
                .
              </>
            )}
          </div>
        )}
      </section>

      <section className={cardClass} aria-labelledby="guide-heading">
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
              Open GitHub token settings{newTab}
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
          <li>Under Permissions, add Contents and set it to Read and write. Leave everything else at No access.</li>
        </ol>
        <p className="m-0 mt-3 text-text-secondary">Then select Generate token, copy it and paste it above.</p>
        <p className="m-0 mt-4 flex items-start gap-2 rounded-lg bg-surface-subtle px-3 py-2.5 text-sm text-text-primary">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Tip:</strong> GitHub shows the token only once. Save it in your password
            manager so you can paste it again later.
          </span>
        </p>
      </section>

      <details className="group rounded-xl bg-met-tint">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-6 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="size-5 shrink-0 text-met-text" aria-hidden="true" />
          <span className="flex-1">How we protect your token</span>
          <ChevronDown
            className="size-5 shrink-0 text-text-secondary transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <ul className="m-0 flex list-disc flex-col gap-2 px-6 pb-6 pl-11 text-sm text-text-primary marker:text-text-secondary">
          <li>
            <strong className="font-semibold">Stays in your browser.</strong> Kept in this tab only and cleared when you
            close it, unless you tick &ldquo;Remember me&rdquo;. There is no server in between.
          </li>
          <li>
            <strong className="font-semibold">Goes only to GitHub.</strong> Sent to {apiHost} and nowhere else. A strict
            content security policy blocks other connections, inline scripts and <code>eval</code>, and the app refuses to
            load inside another page.
          </li>
          <li>
            <strong className="font-semibold">Never stored with your data.</strong> It is not written to the repository,
            the dataset or any commit.
          </li>
          <li>
            <strong className="font-semibold">Limited by design.</strong> A fine-grained token reaches {repoLabel} only,
            with Contents access, and expires after a year.{' '}
            <a href={tokenManagementLink} target="_blank" rel="noreferrer" className="underline">
              Revoke it in GitHub any time{newTab}
            </a>
            .
          </li>
          <li>
            <strong className="font-semibold">One thing to know.</strong> The browser keeps it unencrypted, so tick
            &ldquo;Remember me&rdquo; only on a device you trust.
          </li>
        </ul>
      </details>
    </main>
  );
}
