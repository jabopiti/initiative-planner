/** "One write is in flight at a time" (§10.3) — a simple global FIFO mutex every commit goes through. */
export class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    // Swallow rejections here so one failed write doesn't wedge the queue for
    // the next one — the caller of `run` still sees the original rejection.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
