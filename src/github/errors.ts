export type GithubFailureCause =
  | 'unreachable'
  | 'access-denied'
  | 'rate-limited'
  | 'not-found'
  | 'conflict'
  | 'dataset-newer'
  | 'process-mismatch'
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
  'access-denied': 'GitHub refused access with this token',
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

/** The two causes §3's Sync failures table marks "Automatic": retrying can succeed by itself, with no user
 * action. The others — access denied; process mismatch / dataset newer — need the user to do something first
 * (a new token; a reload), so a shared background retry loop (§9.9) only ever fires for these two. */
export const AUTOMATIC_RETRY_CAUSES: readonly GithubFailureCause[] = ['unreachable', 'rate-limited'];

/** `state.message` without trailing punctuation, for splicing into a sentence (e.g. "Not saved: `<this>`."). */
export function causeText(state: ReadOnlyState): string {
  return state.message.replace(/[.\s]+$/, '');
}

const SHORT_CAUSES: Partial<Record<GithubFailureCause, string>> = {
  unreachable: 'Cannot reach GitHub',
  'rate-limited': 'Rate limited',
  'access-denied': 'Access denied',
  'dataset-newer': 'Dataset newer than this build',
  'process-mismatch': 'Different process build',
};

/** The few words the sync indicator shows beside "Read-only" (§5.1); the banner carries the full message. */
export function shortCause(state: ReadOnlyState): string {
  return SHORT_CAUSES[state.cause] ?? 'Cannot save';
}
