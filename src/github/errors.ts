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

/** The read-only state (§3 Sync failures) a failed request should show: the API's own cause/message, or a fallback for a non-API failure. */
export function toReadOnlyState(error: unknown, fallbackMessage: string): ReadOnlyState {
  if (error instanceof GithubApiError) return { cause: error.cause_, message: error.message };
  return { cause: 'unknown', message: fallbackMessage };
}
