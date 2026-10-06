import { formatClock } from '../data/dates';
export type GithubFailureCause =
  | 'unreachable'
  | 'access-denied'
  | 'rate-limited'
  | 'not-found'
  | 'conflict'
  | 'dataset-newer'
  | 'process-mismatch'
  | 'dataset-older'
  | 'damaged'
  | 'unknown';

export class GithubApiError extends Error {
  readonly cause_: GithubFailureCause;
  readonly status?: number;
  /** Rate limited: when requests may be sent again (ms since the epoch). */
  readonly retryAt?: number;

  constructor(message: string, cause: GithubFailureCause, status?: number, retryAt?: number) {
    super(message);
    this.name = 'GithubApiError';
    this.cause_ = cause;
    this.status = status;
    this.retryAt = retryAt;
  }
}

/**
 * A dataset file that cannot be parsed or fails validation (§3 Damaged data): `file` and `what` make the message,
 * "Dataset damaged: <file>: <what>. Ask the repository owner to restore …".
 */
export class DamagedDataError extends Error {
  constructor(
    readonly file: string,
    readonly what: string,
  ) {
    super(`Dataset damaged: ${file}: ${what}. Ask the repository owner to restore an earlier version from the commit history.`);
    this.name = 'DamagedDataError';
  }
}

/**
 * Why a request failed (§3 Sync failures), from its status, headers and GitHub's message. A 403 is a rate limit when
 * no requests remain, GitHub names a time to retry after, or its message says so (a secondary limit has neither
 * header always); any other 403 is access denied. A 5xx is GitHub being unreachable, as a network error is.
 */
export function classifyFailure(status: number, headers: Headers, message: string): GithubFailureCause {
  if (status === 429) return 'rate-limited';
  if (status === 403 && (headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after') || /rate limit/i.test(message))) {
    return 'rate-limited';
  }
  if (status === 401 || status === 403) return 'access-denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'unreachable';
  return 'unknown';
}

/** The words §3 uses when GitHub cannot be reached, for a network error, a timeout or a 5xx alike. */
export const UNREACHABLE_MESSAGE = 'Cannot reach GitHub; changes are paused.';

export interface ReadOnlyState {
  cause: GithubFailureCause;
  message: string;
  /** Rate limited: when saving resumes by itself (ms since the epoch). */
  retryAt?: number;
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
  if (error instanceof DamagedDataError) return { cause: 'damaged', message: error.message };
  if (error instanceof GithubApiError && error.cause_ === 'rate-limited' && error.retryAt !== undefined) {
    return { cause: 'rate-limited', message: `GitHub is limiting requests. Saving resumes by itself at ${formatClock(error.retryAt)}.`, retryAt: error.retryAt };
  }
  if (error instanceof GithubApiError) return { cause: error.cause_, message: CAUSE_MESSAGES[error.cause_] ?? error.message };
  return { cause: 'unknown', message: fallbackMessage };
}

/** The two causes §3's Sync failures table marks "Automatic": retrying can succeed by itself, with no user
 * action. The others — access denied; process mismatch / dataset newer — need the user to do something first
 * (a new token; a reload), so a shared background retry loop (§9.9) only ever fires for these two. */
export const AUTOMATIC_RETRY_CAUSES: readonly GithubFailureCause[] = ['unreachable', 'rate-limited'];

/** The causes under which the dataset may not be written at all (§3 Data integrity, Damaged data): every write is
 * refused before anything is sent, until a pull finds a dataset this build can use. */
export const REFUSED_DATASET_CAUSES: readonly GithubFailureCause[] = ['process-mismatch', 'dataset-newer', 'dataset-older', 'damaged'];

/** `state.message` without trailing punctuation, for splicing into a sentence (e.g. "Not saved: `<this>`."). A refused
 * dataset is named by its short cause: the banner carries the full message (§3). */
export function causeText(state: ReadOnlyState): string {
  if (REFUSED_DATASET_CAUSES.includes(state.cause)) return shortCause(state);
  return state.message.replace(/[.\s]+$/, '');
}

const SHORT_CAUSES: Partial<Record<GithubFailureCause, string>> = {
  unreachable: 'Cannot reach GitHub',
  'rate-limited': 'Rate limited',
  'access-denied': 'Access denied',
  'dataset-newer': 'Dataset newer than this build',
  'process-mismatch': 'Different process build',
  'dataset-older': 'Dataset older than this build',
  damaged: 'Dataset damaged',
};

/** The few words the sync indicator shows beside "Read-only" (§5.1); the banner carries the full message. */
export function shortCause(state: ReadOnlyState): string {
  return SHORT_CAUSES[state.cause] ?? 'Cannot save';
}
