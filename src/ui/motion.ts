import { useEffect, useRef, useState } from 'react';

/** Whether the user asked for reduced motion (§9.5): every motion is skipped then and the end state shows at once. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How long a key figure takes to roll to its new value (§5.4, slice 059: ≤ 300 ms). */
export const ROLL_MS = 300;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * How many times a figure has recalculated while on screen (slice 059): 0 until its first change, then a new number
 * per change — the key for its brief tint, so a second change restarts it. Never counts under reduced motion (§9.5).
 */
export function useRecalculated(value: number): number {
  const [count, setCount] = useState(0);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!prefersReducedMotion()) setCount(count + 1);
  }
  return count;
}

/**
 * A key figure that moves to its new value (slice 059): a change while it is on screen rolls the shown number from
 * the old value to the new over {@link ROLL_MS}, with {@link useRecalculated}'s tint. Never on first render, and never
 * under reduced motion, where the new value shows at once with no tint (§9.5).
 */
export function useRolledFigure(value: number): { shown: number; recalculated: number } {
  const recalculated = useRecalculated(value);
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    from.current = value;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame: number | null = null;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / ROLL_MS);
      setShown(t === 1 ? value : start + (value - start) * easeOut(t));
      frame = t === 1 ? null : requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      setShown(value);
    };
  }, [value]);

  // Under reduced motion the new value shows on the very render it arrives, not a frame later.
  return { shown: prefersReducedMotion() ? value : shown, recalculated };
}
