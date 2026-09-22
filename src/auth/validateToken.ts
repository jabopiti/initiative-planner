import type { GithubLocation } from '../brand/types';
import { GithubClient } from '../github/client';
import { GithubApiError } from '../github/errors';

/** The checked-token outcomes table (§5.10). */
export type TokenCheckResult =
  | { outcome: 'works'; login: string }
  | { outcome: 'classic-warning'; login: string }
  | { outcome: 'cannot-see-repo' }
  | { outcome: 'read-only' }
  | { outcome: 'pending-approval' }
  | { outcome: 'invalid' };

export const TOKEN_CHECK_MESSAGES: Record<TokenCheckResult['outcome'], (login?: string) => string> = {
  works: (login) => `Connected as ${login}`,
  'classic-warning': (login) => `Connected as ${login}`,
  'cannot-see-repo': () => "This token can't see the repository. Create it with access to that repository.",
  'read-only': () => 'This token can read but not write. Set Contents to Read and write.',
  'pending-approval': () => 'Your GitHub organisation needs to approve this token first. Ask your GitHub owner.',
  invalid: () => "GitHub doesn't accept this token.",
};

export async function checkToken(location: GithubLocation, token: string): Promise<TokenCheckResult> {
  const client = new GithubClient(location, () => token);

  let identity: { login: string; scopesClassic: boolean };
  try {
    identity = await client.checkToken();
  } catch {
    return { outcome: 'invalid' };
  }

  try {
    const access = await client.checkRepoAccess();
    if (!access.visible) return { outcome: 'cannot-see-repo' };
    if (!access.canWrite) return { outcome: 'read-only' };
    return identity.scopesClassic
      ? { outcome: 'classic-warning', login: identity.login }
      : { outcome: 'works', login: identity.login };
  } catch (error) {
    // A fine-grained token awaiting organisation approval is rejected with a
    // 403 whose message names the pending-approval state, distinct from a
    // plain access-denied 403/404 (§5.10). Not exercised by slice 002's
    // spike (a classic token, not a fine-grained org-pending one) — worth
    // confirming against a real pending token (see TODO.md).
    if (error instanceof GithubApiError && error.status === 403 && /pending|approv/i.test(error.message)) {
      return { outcome: 'pending-approval' };
    }
    return { outcome: 'cannot-see-repo' };
  }
}
