import { act, cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arriveAt, useArrival, type ArrivalTarget } from './arrival';

function Target({ target }: { target: ArrivalTarget }) {
  const ref = useRef<HTMLButtonElement>(null);
  const arrived = useArrival(target, ref);
  return (
    <button ref={ref} type="button" data-arrived={arrived}>
      New team
    </button>
  );
}
const button = () => screen.getByRole('button', { name: 'New team' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  act(() => vi.runAllTimers()); // ends any highlight still showing, which clears the pending arrival
  vi.useRealTimers();
});

describe('Arrival from a Getting started step (§5.2)', () => {
  it('focuses and highlights the step’s place for 3 seconds', () => {
    arriveAt('team');
    render(<Target target="team" />);
    expect(button()).toHaveFocus();
    expect(button()).toHaveAttribute('data-arrived', 'true');
    act(() => vi.advanceTimersByTime(2999));
    expect(button()).toHaveAttribute('data-arrived', 'true');
    act(() => vi.advanceTimersByTime(1));
    expect(button()).toHaveAttribute('data-arrived', 'false');
  });

  it('highlights once: showing the place again later does not', () => {
    arriveAt('team');
    render(<Target target="team" />);
    act(() => vi.advanceTimersByTime(3000));
    cleanup();
    render(<Target target="team" />);
    expect(button()).toHaveAttribute('data-arrived', 'false');
  });

  it('leaves another step’s place alone', () => {
    arriveAt('rates');
    render(<Target target="team" />);
    expect(button()).not.toHaveFocus();
    expect(button()).toHaveAttribute('data-arrived', 'false');
  });

  it('lapses when the place does not appear soon (a step that led elsewhere)', () => {
    arriveAt('team');
    act(() => vi.advanceTimersByTime(2001));
    render(<Target target="team" />);
    expect(button()).toHaveAttribute('data-arrived', 'false');
  });
});
