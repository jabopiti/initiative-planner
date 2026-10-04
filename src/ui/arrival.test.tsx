import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GettingStartedStep } from '../data/gettingStarted';
import { arriveAt, useArrival, type ArrivalTarget } from './arrival';

function Target({ target, fill }: { target: ArrivalTarget; fill?: boolean }) {
  const arrival = useArrival<HTMLButtonElement>(target, { fill });
  return (
    <button {...arrival} type="button">
      New team
    </button>
  );
}
const button = () => screen.getByRole('button', { name: 'New team' });
const step = (id: ArrivalTarget, arrives = true): GettingStartedStep => ({ id, label: id, href: '#/teams', arrives, done: false });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Arrival from a Getting started step (§5.2)', () => {
  it('focuses and highlights the step’s place, ring and fill, for 3 seconds', () => {
    arriveAt(step('team'));
    render(<Target target="team" />);
    expect(button()).toHaveFocus();
    expect(button()).toHaveClass('ring-brand-accent', 'bg-brand-accent-tint');
    act(() => vi.advanceTimersByTime(2999));
    expect(button()).toHaveClass('ring-brand-accent');
    act(() => vi.advanceTimersByTime(1));
    expect(button()).not.toHaveClass('ring-brand-accent');
  });

  it('shows the ring alone without the fill', () => {
    arriveAt(step('team'));
    render(<Target target="team" fill={false} />);
    expect(button()).toHaveClass('ring-brand-accent');
    expect(button()).not.toHaveClass('bg-brand-accent-tint');
  });

  it('highlights once: showing the place again later does not', () => {
    arriveAt(step('team'));
    render(<Target target="team" />);
    cleanup();
    render(<Target target="team" />);
    expect(button()).not.toHaveFocus();
    expect(button()).not.toHaveClass('ring-brand-accent');
  });

  it('leaves another step’s place alone', () => {
    arriveAt(step('rates'));
    render(<Target target="team" />);
    expect(button()).not.toHaveFocus();
    expect(button()).not.toHaveClass('ring-brand-accent');
  });

  it('marks nothing for a step that leads elsewhere (to Teams, for want of an active team)', () => {
    arriveAt(step('team'));
    arriveAt(step('team', false));
    render(<Target target="team" />);
    expect(button()).not.toHaveClass('ring-brand-accent');
  });
});
