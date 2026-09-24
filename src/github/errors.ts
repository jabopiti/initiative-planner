export type GithubFailureCause =
  | 'unreachable'
  | 'access-denied'
  | 'rate-limited'
  | 'not-found'
  | 'conflict'
  | 'unknown';

export class GithubApiError extends Error {
  readonly cause_: GithubFailureCause;
  readonly status?: number;

  constructor(message: string, cause: GithubFailureCause, status?: number) {
    super(message);
    this.name = 'GithubApiError';
    this.cause_ = cause;
    this.status = status;
  }
}

export function classifyStatus(status: number): GithubFailureCause {
  if (status === 401 || status === 403) return 'access-denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate-limited';
  return 'unknown';
}

export interface ReadOnlyState {
  cause: GithubFailureCause;
  message: string;
}

/** What the read-only state says for the causes §3 Sync failures names, because each needs a different fix. */
const CAUSE_MESSAGES: Partial<Record<GithubFailureCause, string>> = {
  'access-denied': 'The token is missing, expired, revoked or lacks write permission',
  'rate-limited': 'GitHub is limiting requests; try again shortly',
};

/**
 * The read-only state (§3 Sync failures) a failed request should show: §3's wording for the cause where it
 * has one, otherwise the API's own message, or a fallback for a non-API failure.
 */
export function toReadOnlyState(error: unknown, fallbackMessage: string): ReadOnlyState {
  if (error instanceof GithubApiError) return { cause: error.cause_, message: CAUSE_MESSAGES[error.cause_] ?? error.message };
  return { cause: 'unknown', message: fallbackMessage };
}
