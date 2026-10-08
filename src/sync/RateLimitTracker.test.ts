import { describe, expect, it, vi } from 'vitest';
import { RateLimitTracker } from './RateLimitTracker';

const headers = (remaining: number) =>
  new Headers({ 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-limit': '5000', 'x-ratelimit-reset': '1700000000' });

describe('RateLimitTracker', () => {
  it('knows nothing before a response carried the budget', () => {
    expect(new RateLimitTracker().get()).toBeNull();
  });

  it('reads the budget and tells subscribers only when it changes', () => {
    const tracker = new RateLimitTracker();
    const listener = vi.fn();
    tracker.subscribe(listener);
    tracker.note(headers(4999));
    tracker.note(headers(4999));
    expect(tracker.get()).toEqual({ remaining: 4999, limit: 5000, resetsAt: 1700000000_000 });
    expect(listener).toHaveBeenCalledTimes(1);
    tracker.note(headers(4998));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ignores a response missing any of the three headers', () => {
    const tracker = new RateLimitTracker();
    tracker.note(new Headers({ 'x-ratelimit-remaining': '10', 'x-ratelimit-limit': '5000' }));
    expect(tracker.get()).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const tracker = new RateLimitTracker();
    const listener = vi.fn();
    tracker.subscribe(listener)();
    tracker.note(headers(1));
    expect(listener).not.toHaveBeenCalled();
  });
});
