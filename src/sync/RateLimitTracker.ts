/** GitHub's request budget for the hour, from the latest response's headers (§5.9); `resetsAt` is epoch milliseconds. */
export interface RateLimit {
  remaining: number;
  limit: number;
  resetsAt: number;
}

const HEADERS = ['x-ratelimit-remaining', 'x-ratelimit-limit', 'x-ratelimit-reset'];

/** The budget the latest response reported, and who wants to know when it changes. */
export class RateLimitTracker {
  private current: RateLimit | null = null;
  private readonly listeners = new Set<() => void>();

  /** The budget the latest response reported (§5.9), or null before any response carried it. */
  readonly get = (): RateLimit | null => this.current;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads a response's headers; a response that does not carry all three, or an unchanged budget, notifies nobody. */
  note(headers: Headers): void {
    const [remaining, limit, reset] = HEADERS.map((name) => Number(headers.get(name)));
    // Number(null) is 0, so every header must be present, not just parse.
    const complete = HEADERS.every((name) => headers.has(name));
    if (!complete || ![remaining, limit, reset].every(Number.isFinite)) return;
    if (this.current?.remaining === remaining && this.current.limit === limit && this.current.resetsAt === reset * 1000) return;
    this.current = { remaining, limit, resetsAt: reset * 1000 };
    for (const listener of this.listeners) listener();
  }
}
