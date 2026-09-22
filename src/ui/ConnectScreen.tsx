import { useState } from 'react';
import { defaultBrandPack } from '../brand/defaultBrand';
import { checkToken, TOKEN_CHECK_MESSAGES, type TokenCheckResult } from '../auth/validateToken';
import { tokenCreationUrl } from '../auth/tokenCreationUrl';
import styles from './ConnectScreen.module.css';

export function ConnectScreen({ onConnected }: { onConnected: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<TokenCheckResult | null>(null);
  const brand = defaultBrandPack;
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
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Connect to {brand.productName}</h1>
        <p className={styles.subtitle}>
          Paste a GitHub personal access token to get started, or follow the steps below to create one.
        </p>

        <form className={styles.tokenForm} onSubmit={handleConnect}>
          <label className={styles.label} htmlFor="token-field">
            GitHub token
          </label>
          <div className={styles.tokenRow}>
            <input
              id="token-field"
              className={styles.tokenInput}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_..."
            />
            <button className={styles.connectButton} type="submit" disabled={checking || !token.trim()}>
              {checking ? 'Checking…' : 'Connect'}
            </button>
          </div>
        </form>

        {result && (
          <div
            className={
              result.outcome === 'works'
                ? styles.messageOk
                : result.outcome === 'classic-warning'
                  ? styles.messageWarning
                  : styles.messageError
            }
            role="status"
          >
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

        <ol className={styles.steps}>
          <li>
            <h2>Create the token on GitHub</h2>
            <p>
              <a
                className={styles.stepButton}
                href={tokenCreationUrl(brand.github, brand.productName)}
                target="_blank"
                rel="noreferrer"
              >
                Open GitHub token settings
              </a>
              . Set an expiry of one year and Contents to Read and write.
            </p>
          </li>
          <li>
            <h2>Choose the repository</h2>
            <p>
              Under repository access, choose &ldquo;Only select repositories&rdquo; and pick{' '}
              <code className={styles.repoName}>{repoLabel}</code>{' '}
              <button type="button" className={styles.copyButton} onClick={copyRepoName}>
                Copy
              </button>
              . Every other permission stays at No access.
            </p>
          </li>
          <li>
            <h2>Generate, copy and paste</h2>
            <p>Select Generate token, copy it, and paste it into the field above.</p>
          </li>
        </ol>
      </div>
    </div>
  );
}
