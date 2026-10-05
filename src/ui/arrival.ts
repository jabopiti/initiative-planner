import { useEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import type { GettingStartedStep } from '../data/gettingStarted';

/** Where a Getting started step leads (§5.2): the place it is done, named by the step. */
export type ArrivalTarget = GettingStartedStep['id'];

/** How long the arrival highlight stays (§5.2). */
const HIGHLIGHT_MS = 3000;

/** The Accent ring and fill that mark a place to act on: a step arrived at (§5.2), the draft's next step (§5.4). */
export const ACCENT_RING = 'ring-2 ring-brand-accent ring-offset-2 ring-offset-surface-page';
export const ACCENT_FILL = 'border-brand-accent bg-brand-accent-tint';
/** The highlight fades out where motion is allowed, and simply goes otherwise (§9.5). */
const FADE = 'transition-[color,box-shadow,background-color,border-color] duration-500 motion-reduce:transition-none';

let pending: ArrivalTarget | null = null;

/** Following a Getting started step that leads to its place: that place, once shown, gets focus and the highlight. */
export function arriveAt(step: GettingStartedStep): void {
  pending = step.arrives ? step.id : null;
}

/**
 * The place a Getting started step is done (§5.2): `ref` goes on its control, `className` on the same control. Arrived
 * at from the step, it takes focus and shows the Accent ring and fill for {@link HIGHLIGHT_MS}; on a solid (primary)
 * button pass `fill: false`, as the fill would wash out its own.
 */
export function useArrival<T extends HTMLElement>(target: ArrivalTarget, { fill = true } = {}): { ref: RefObject<T | null>; className: string } {
  const ref = useRef<T>(null);
  const [highlighted, setHighlighted] = useState(false);
  useEffect(() => {
    if (pending !== target) return;
    pending = null;
    ref.current?.scrollIntoView?.({ block: 'center' });
    ref.current?.focus();
    setHighlighted(true);
  }, [target]);
  // Its own effect, so a re-run (Strict Mode) re-arms the timer rather than leaving the highlight on.
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);
  return { ref, className: cn(FADE, highlighted && ACCENT_RING, highlighted && fill && ACCENT_FILL) };
}
