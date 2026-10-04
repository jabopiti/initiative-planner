import { useEffect, useState, type RefObject } from 'react';
import type { GettingStartedStep } from '../data/gettingStarted';

/** Where a Getting started step leads (§5.2): the place it is done, named by the step. */
export type ArrivalTarget = GettingStartedStep['id'];

/** How long the arrival highlight stays (§5.2). */
const HIGHLIGHT_MS = 3000;
/** How long a followed step waits for its place to appear: a link to elsewhere (no active team yet) highlights nothing later. */
const PENDING_MS = 2000;

/** The Accent ring and tint on an arrival target (§5.2); it fades out where motion is allowed, and simply goes otherwise (§9.5). */
export const ARRIVAL_RING = 'ring-2 ring-brand-accent ring-offset-2 ring-offset-surface-page';
export const ARRIVAL_HIGHLIGHT = `${ARRIVAL_RING} bg-brand-accent-tint`;
export const ARRIVAL_TRANSITION = 'motion-safe:transition-[color,box-shadow,background-color] motion-safe:duration-500';

let pending: { target: ArrivalTarget; at: number } | null = null;

/** Following a Getting started step: its place, once shown, gets focus and the highlight. */
export function arriveAt(target: ArrivalTarget): void {
  pending = { target, at: Date.now() };
}

/**
 * Whether this place was just arrived at from its Getting started step (§5.2): if so, on mount it moves focus to `ref`
 * and returns true for {@link HIGHLIGHT_MS}, the time the highlight shows.
 */
export function useArrival(target: ArrivalTarget, ref: RefObject<HTMLElement | null>): boolean {
  const [highlighted, setHighlighted] = useState(false);
  useEffect(() => {
    if (pending?.target !== target || Date.now() - pending.at > PENDING_MS) return;
    ref.current?.scrollIntoView?.({ block: 'center' });
    ref.current?.focus();
    setHighlighted(true);
    // Cleared only once the highlight ends, so a re-run effect (Strict Mode) highlights again rather than never ending it.
    const timer = setTimeout(() => {
      pending = null;
      setHighlighted(false);
    }, HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [target, ref]);
  return highlighted;
}
