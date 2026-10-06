import { budgetOutcome, budgetStore, type BudgetLines } from '../cache/db';
import { HOUR_MS } from '../data/dates';

/** Below GitHub's 80 a minute and 500 an hour, to leave room for the user's other tools (§10.3). */
export const BUDGET_LINES: BudgetLines = { perMinute: 60, perHour: 400 };

/**
 * The write budget (§10.3): before each content-creating request, a place under both lines is reserved in the count
 * this browser's tabs share (IndexedDB, §10.4), waiting until one frees up when there is none.
 *
 * Each reservation is one IndexedDB transaction, which runs one at a time across tabs, so two tabs never both take the
 * last place. Where IndexedDB can't be used, the tab counts its own. Each request is announced to the other tabs, and a
 * tab showing the count (Settings, §5.9) reads it again when one arrives.
 */
export class WriteBudget {
  private known: number[] = [];
  private shared = true;
  private lastHour = 0;
  private readonly listeners = new Set<() => void>();
  /** Open only while something shows the count. */
  private channel: BroadcastChannel | null = null;

  constructor(
    private readonly key: string,
    private readonly lines: BudgetLines = BUDGET_LINES,
  ) {}

  private get channelName(): string {
    return `write-budget:${this.key}`;
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
      this.know(outcome.sent, now);
      if (typeof BroadcastChannel === 'function') {
        const announce = new BroadcastChannel(this.channelName);
        announce.postMessage(now);
        announce.close();
      }
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
    return budgetOutcome(this.known.filter((at) => at > now - HOUR_MS), now, this.lines);
  }

  /** How many content-creating requests this browser sent in the last hour, as this tab knows it. */
  sentThisHour = (): number => this.lastHour;

  /** The hour line, for the Settings line (§5.9). */
  get hourLine(): number {
    return this.lines.perHour;
  }

  /** Follows the count: it is read now, and again whenever any tab sends a request, until the last listener leaves. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.channel && typeof BroadcastChannel === 'function') {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = () => void this.refresh();
    }
    void this.refresh();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.channel?.close();
      this.channel = null;
    };
  };

  /** Reads the shared count again, dropping requests older than an hour. */
  private async refresh(): Promise<void> {
    const now = Date.now();
    try {
      // IndexedDB holds every tab's requests: it replaces what this tab knew rather than adding to it.
      this.know(this.shared ? await budgetStore.sentSince(this.key, now) : this.known, now);
    } catch {
      this.shared = false;
    }
  }

  private know(times: number[], now: number): void {
    this.known = times.filter((at) => at > now - HOUR_MS);
    if (this.known.length === this.lastHour) return;
    this.lastHour = this.known.length;
    for (const listener of this.listeners) listener();
  }
}
