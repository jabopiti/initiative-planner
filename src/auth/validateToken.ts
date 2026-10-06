import type { GithubLocation } from '../brand/types';
import { GithubClient } from '../github/client';
import { CAUSE_MESSAGES, GithubApiError } from '../github/errors';

/** The checked-token outcomes table (§5.10). */
export type TokenCheckResult =
  | { outcome: 'works'; login: string }
  | { outcome: 'classic-warning'; login: string }
  | { outcome: 'cannot-see-repo' }
  | { outcome: 'read-only' }
  | { outcome: 'pending-approval' }
  | { outcome: 'invalid' }
  | { outcome: 'unreachable' }
  | { outcome: 'rate-limited' };

/** What a message names: the GitHub user the token belongs to and the repository (`owner/repo`) it must reach. */
export interface TokenMessageContext {
  login?: string;
  repo: string;
}

export const TOKEN_CHECK_MESSAGES: Record<TokenCheckResult['outcome'], (context: TokenMessageContext) => string> = {
  works: ({ login }) => `Connected as ${login}`,
  'classic-warning': ({ login }) => `Connected as ${login}`,
  'cannot-see-repo': ({ repo }) => `This token can't see ${repo}. Create it with access to that repository.`,
  'read-only': () => 'This token can read but not write. Set Contents to Read and write.',
  'pending-approval': () => 'Your GitHub organisation needs to approve this token first. Ask your GitHub owner.',
  invalid: () =>
    "GitHub doesn't accept this token. It has probably expired or been revoked, or part of it is missing from the paste.",
  unreachable: () => "Couldn't reach GitHub to check the token. Check your connection and try again.",
  'rate-limited': () => `${CAUSE_MESSAGES['rate-limited']}.`,
};

/** The `owner/repo` of the brand pack's repository, for messages. */
export function repoLabel(location: GithubLocation): string {
  return `${location.owner}/${location.repo}`;
}

/** A failure §3 retries by itself (no connection, a server error, a rate limit): it says nothing about the token. */
function transientOutcome(error: unknown): { outcome: 'unreachable' | 'rate-limited' } | null {
  if (!(error instanceof GithubApiError)) return null;
  if (error.cause_ === 'unreachable') return { outcome: 'unreachable' };
  if (error.cause_ === 'rate-limited') return { outcome: 'rate-limited' };
  return null;
}

/** The check couldn't ask GitHub just now (§3 retries these by itself), so it found nothing wrong with the token. */
export function isTransient(result: TokenCheckResult): boolean {
  return result.outcome === 'unreachable' || result.outcome === 'rate-limited';
}

export async function checkToken(location: GithubLocation, token: string): Promise<TokenCheckResult> {
  const client = new GithubClient(location, () => token);

  let identity: { login: string; scopesClassic: boolean };
  try {
    identity = await client.checkToken();
  } catch (error) {
    // Only a 401 means GitHub rejected the token outright; a rate limit is reported as such, and anything else
    // (a network failure, another 403, a 5xx) says nothing about the token, so reads as unreachable. Wider than the
    // repo-access step below, which still has cannot-see-repo and pending-approval to fall back to.
    if (error instanceof GithubApiError && error.status === 401) return { outcome: 'invalid' };
    return transientOutcome(error) ?? { outcome: 'unreachable' };
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
    // Checked first: GitHub's message names the approval, whatever limit headers the 403 also carries.
    if (error instanceof GithubApiError && error.status === 403 && /pending|approv/i.test(error.message)) {
      return { outcome: 'pending-approval' };
    }
    return transientOutcome(error) ?? { outcome: 'cannot-see-repo' };
  }
}
