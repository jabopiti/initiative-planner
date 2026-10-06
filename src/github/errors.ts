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

  constructor(message: string, cause: GithubFailureCause, status?: number) {
    super(message);
    this.name = 'GithubApiError';
    this.cause_ = cause;
    this.status = status;
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

/** GitHub's own `message` from a JSON error body, or '' when the body is not one. */
export function githubMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === 'object' && 'message' in parsed ? String(parsed.message) : '';
  } catch {
    return '';
  }
}

/**
 * The cause of a failed response (§3 Sync failures). GitHub answers a primary or secondary rate limit with a 403 as
 * often as a 429, so a 403 is only "access denied" when nothing says it is a limit: a `retry-after`, a body naming a
 * rate limit, or, for a body without a message, no requests left (`x-ratelimit-remaining: 0`). A 403 whose message
 * names something else is that, even when it happened to spend the last request. A server error is "unreachable", as
 * the token check (§5.10) already reads it, so the automatic retry covers it.
 */
export function classifyFailure(status: number, headers: Headers, body: string): GithubFailureCause {
  if (status === 429 || (status === 403 && isRateLimit(headers, body))) return 'rate-limited';
  if (status === 401 || status === 403) return 'access-denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'unreachable';
  return 'unknown';
}

function isRateLimit(headers: Headers, body: string): boolean {
  if (headers.has('retry-after') || /rate limit/i.test(body)) return true;
  return headers.get('x-ratelimit-remaining') === '0' && githubMessage(body) === '';
}

export interface ReadOnlyState {
  cause: GithubFailureCause;
  message: string;
}

/** What the read-only state says for the causes §3 Sync failures names, because each needs a different fix. */
export const CAUSE_MESSAGES: Partial<Record<GithubFailureCause, string>> = {
  unreachable: 'Cannot reach GitHub; changes are paused.',
  'access-denied': 'GitHub refused access with this token',
  'rate-limited': 'GitHub is limiting requests; try again shortly',
};

/**
 * The read-only state (§3 Sync failures) a failed request should show: §3's wording for the cause where it
 * has one, otherwise the API's own message, or a fallback for a non-API failure.
 */
export function toReadOnlyState(error: unknown, fallbackMessage: string): ReadOnlyState {
  if (error instanceof DamagedDataError) return { cause: 'damaged', message: error.message };
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
