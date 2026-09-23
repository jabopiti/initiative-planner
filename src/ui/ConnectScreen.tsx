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

export function ConnectScreen({ onConnected }: { onConnected: (token: string) => void }) {
  const [token, setToken] = useState('');
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
      onConnected(token.trim());
    }
  }

  async function copyRepoName() {
    try {
      await navigator.clipboard.writeText(repoLabel);
    } catch {
      // Clipboard access can be refused; the name is also shown as plain text.
    }
  }

  return (
    <div className="flex min-h-full items-start justify-center px-4 py-16">
      <div className="w-full max-w-[560px] rounded-xl border border-border-default bg-surface-card p-8">
        <h1 className="m-0 mb-2 text-[22px]">Connect to {brand.productName}</h1>
        <p className="m-0 mb-6 text-text-secondary">
          Paste a GitHub personal access token to get started, or follow the steps below to create one.
        </p>

        <form className="mb-2 flex flex-col gap-1.5" onSubmit={handleConnect}>
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
        </form>

        {result && (
          <div className={`my-3 rounded-lg px-3 py-2.5 text-sm ${MESSAGE_STYLES[result.outcome]}`} role="status">
            {TOKEN_CHECK_MESSAGES[result.outcome]('login' in result ? result.login : undefined)}
            {result.outcome === 'classic-warning' && (
              <>
                {' '}
                — a classic token reaches all of your repositories.{' '}
                <a href={tokenCreationUrl(brand.github, brand.productName)} target="_blank" rel="noreferrer">
                  Create a fine-grained one instead
                </a>
                .
              </>
            )}
          </div>
        )}

        <section className="mt-6">
          <h2 className="m-0 mb-3 text-base">How to create the token on GitHub</h2>
          <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-text-secondary marker:font-semibold marker:text-text-primary">
            <li>
              <a
                className="inline-block rounded-lg bg-brand-accent-tint px-3 py-1.5 font-semibold text-brand-accent-text no-underline"
                href={tokenCreationUrl(brand.github, brand.productName)}
                target="_blank"
                rel="noreferrer"
              >
                Open GitHub token settings
              </a>
            </li>
            <li>Set an expiry of one year.</li>
            <li>
              Under repository access, choose &ldquo;Only select repositories&rdquo; and pick{' '}
              <code className="rounded bg-surface-subtle px-1.5 py-0.5">{repoLabel}</code>{' '}
              <Button type="button" variant="outline" size="xs" onClick={copyRepoName}>
                Copy
              </Button>
              . Every other permission stays at No access.
            </li>
            <li>Under permissions, set Contents to Read and write.</li>
          </ol>
          <p className="m-0 mt-3 text-text-secondary">
            Then select Generate token, copy it and paste it into the field above.
          </p>
        </section>

        <section className="mt-6 rounded-lg bg-surface-subtle px-4 py-3">
          <h2 className="m-0 mb-2 text-sm">How your token is handled</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-text-secondary">
            <li>It is stored only in this browser. It is never written to the repository, the dataset or a commit.</li>
            <li>It is sent only to GitHub ({new URL(brand.github.apiBaseUrl).host}). The app&rsquo;s content security policy blocks connections to anywhere else.</li>
            <li>Limited to {repoLabel} with Contents access, it can&rsquo;t reach your other repositories.</li>
            <li>It is kept unencrypted in browser storage, so only connect on a device you trust. You can revoke it any time in your GitHub token settings.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
