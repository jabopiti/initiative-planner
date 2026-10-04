import { useEffect, useState, type ReactNode } from 'react';

/** Whether the user asked for reduced motion (§9.5). Only the roll needs asking: every CSS motion is behind motion-safe:. */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How long a key figure takes to roll to its new value (§5.4, slice 059: ≤ 300 ms). */
const ROLL_MS = 300;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * How many times a value has changed while on screen (slice 059): 0 until its first change, then a new number per
 * change — the key for its brief tint, so a second change restarts it.
 */
function useRecalculated(value: number): number {
  const [count, setCount] = useState(0);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setCount(count + 1);
  }
  return count;
}

/**
 * A figure that tints briefly each time `value` recalculates (slice 059), never on first render; the tint is
 * motion-safe:, so reduced motion shows none (§9.5).
 */
export function RecalcTint({ value, className = '', children }: { value: number; className?: string; children: ReactNode }) {
  const recalculated = useRecalculated(value);
  // Keyed on the count, so a second change restarts the tint.
  return (
    <span key={recalculated} className={`rounded-sm px-1 ${recalculated ? 'motion-safe:animate-recalc' : ''} ${className}`}>
      {children}
    </span>
  );
}

/**
 * The number to show for a key figure (slice 059): a change while on screen rolls from what is shown to the new value
 * over {@link ROLL_MS}. Never on first render, and never under reduced motion, where the new value shows at once (§9.5).
 */
function useRolled(value: number): number {
  const [roll, setRoll] = useState({ from: value, to: value, shown: value });
  if (roll.to !== value) {
    const from = prefersReducedMotion() ? value : roll.shown;
    setRoll({ from, to: value, shown: from });
  }
  const { from, to } = roll;

  useEffect(() => {
    if (from === to) return;
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - began) / ROLL_MS);
      setRoll({ from: t === 1 ? to : from, to, shown: t === 1 ? to : from + (to - from) * easeOut(t) });
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [from, to]);

  return roll.shown;
}

/**
 * A key figure that rolls to its new value with {@link RecalcTint}'s tint (§5.4, slice 059). Its own component, so
 * each frame of the roll re-renders this one span, not the figures around it.
 */
export function RolledFigure({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const shown = useRolled(value);
  return (
    <RecalcTint value={value} className={className}>
      {format(Math.round(shown))}
    </RecalcTint>
  );
}
