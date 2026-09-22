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
