import { budgetOutcome, budgetStore, type BudgetLines } from '../cache/db';

/** Below GitHub's 80 a minute and 500 an hour, to leave room for the user's other tools (§10.3). */
export const BUDGET_LINES: BudgetLines = { perMinute: 60, perHour: 400 };

const HOUR_MS = 3_600_000;

/**
 * The write budget (§10.3): before each content-creating request, a place under both lines is reserved in the count
 * this browser's tabs share (IndexedDB, §10.4), waiting until one frees up when there is none.
 *
 * Each reservation is one IndexedDB transaction, which runs one at a time across tabs, so two tabs never both take the
 * last place. Where IndexedDB can't be used, the tab counts its own. The tabs announce each request to each other, so
 * every tab's Settings line keeps up.
 */
export class WriteBudget {
  private known: number[] = [];
  private shared = true;
  private lastHour = 0;
  private readonly listeners = new Set<() => void>();
  private readonly channel: BroadcastChannel | null;

  constructor(
    private readonly key: string,
    private readonly lines: BudgetLines = BUDGET_LINES,
  ) {
    this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`write-budget:${key}`) : null;
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<number>) => this.know([...this.known, event.data]);
      // Node's channel (tests) would otherwise keep the process alive; browsers have no unref.
      (this.channel as unknown as { unref?: () => void }).unref?.();
    }
    void this.refresh();
  }

  /** Waits until one more content-creating request stays under both lines, then counts it as sent. */
  async reserve(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const outcome = await this.reserveShared(now);
      if ('waitUntil' in outcome) {
        await new Promise((resolve) => setTimeout(resolve, outcome.waitUntil - now));
        continue;
      }
      this.know(outcome.sent);
      this.channel?.postMessage(now);
      return;
    }
  }

  private async reserveShared(now: number): Promise<{ sent: number[] } | { waitUntil: number }> {
    if (this.shared) {
      try {
        return await budgetStore.reserve(this.key, now, this.lines);
      } catch {
        this.shared = false;
      }
    }
    const outcome = budgetOutcome(this.known.filter((at) => at > now - HOUR_MS), now, this.lines);
    return outcome;
  }

  /** How many content-creating requests this browser sent in the last hour, as this tab knows it. */
  sentThisHour = (): number => this.lastHour;

  /** The hour line, for the Settings line (§5.9). */
  get hourLine(): number {
    return this.lines.perHour;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads the shared count again (on opening, and when Settings shows it), dropping requests older than an hour. */
  async refresh(): Promise<void> {
    const now = Date.now();
    try {
      // IndexedDB holds every tab's requests: it replaces what this tab knew rather than adding to it.
      this.know(this.shared ? await budgetStore.sentSince(this.key, now) : this.known, now);
    } catch {
      this.shared = false;
    }
  }

  private know(times: number[], now = Date.now()): void {
    // Not de-duplicated: two requests can share a millisecond.
    this.known = times.filter((at) => at > now - HOUR_MS).sort((a, b) => a - b);
    if (this.known.length === this.lastHour) return;
    this.lastHour = this.known.length;
    for (const listener of this.listeners) listener();
  }
}
