import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadBarModel } from '../data/capacity';
import { LoadBar } from './LoadBar';

/** Jonas: 50% here, 60% on other Platform work in Nov 2026, Capacity and Team FTE 100% (slice 061's path). */
const jonas: LoadBarModel = { months: [{ month: '2026-11', onTeam: 60, otherTeams: 0, loads: [] }], teamFtePct: 100, capacityPct: 100 };

function renderBar(model: LoadBarModel, value = 50, onChange = vi.fn()) {
  render(<LoadBar name="Jonas Keller" value={value} model={model} onChange={onChange} />);
  return { onChange, bar: screen.getByRole('slider', { name: 'Allocation % for Jonas Keller' }) };
}
/** A segment's span on the bar's 0–150% scale, as "from-to". */
const range = (testId: string) => screen.getByTestId(testId).dataset.range;

afterEach(cleanup);

describe('LoadBar (§5.4, §9.5)', () => {
  it('shows this allocation, the other work and the overflow past the ceiling, with the figures as text', () => {
    const { bar } = renderBar(jonas);
    expect(bar).toHaveAttribute('aria-valuetext', '50%, total load 110% of 100%');
    expect(screen.getByTestId('load-this')).toHaveClass('bg-brand-accent');
    expect(range('load-this')).toBe('0-50');
    expect(range('load-team')).toBe('50-110'); // 60% on the team
    expect(screen.getAllByTestId('load-overflow')).toHaveLength(1);
    expect(range('load-overflow')).toBe('100-110'); // the hatched 10%
    expect(screen.getAllByTestId('load-ceiling')).toHaveLength(1);
    expect(screen.getByText('Capacity and Team FTE 100%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('110% of 100% in Nov 2026')).toBeInTheDocument();
  });

  it('marks each ceiling with its own labelled line when they differ', () => {
    renderBar({ months: [{ month: '2026-12', onTeam: 20, otherTeams: 20, loads: [] }], teamFtePct: 80, capacityPct: 100 }, 30);
    expect(screen.getAllByTestId('load-ceiling')).toHaveLength(2);
    expect(screen.getByText('Team FTE 80%')).toBeInTheDocument();
    expect(screen.getByText('Capacity 100%')).toBeInTheDocument();
    expect(screen.queryByTestId('load-overflow')).not.toBeInTheDocument();
    expect(screen.getByText('70% of 100% in Dec 2026')).toBeInTheDocument();
  });

  it('offers Fill free at the value that fits, and saves it in one click', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar(jonas);
    await user.click(screen.getByRole('button', { name: 'Fill free 40% for Jonas Keller' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(40);
  });

  it('shows no Fill free when the value already fills the free capacity', () => {
    renderBar(jonas, 40);
    expect(screen.queryByRole('button', { name: /Fill free/ })).not.toBeInTheDocument();
  });

  it('outlines an allocation that does not count, never hatches it, and says why', () => {
    const { bar } = renderBar({ ...jonas, notCounted: 'provisional' }, 60);
    expect(screen.getByTestId('load-this')).toHaveClass('border-dashed');
    expect(screen.queryByTestId('load-overflow')).not.toBeInTheDocument();
    expect(screen.getByText('Provisional, not counted · 60% elsewhere in Nov 2026')).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-valuetext', '60%, provisional, not counted');
  });

  it('shows no load line and no Fill free without a period, and the stops still set the value', async () => {
    const user = userEvent.setup();
    const { bar, onChange } = renderBar({ months: [], teamFtePct: 100, capacityPct: 100 });
    expect(bar).toHaveAttribute('aria-valuetext', '50%');
    expect(screen.queryByText(/ of 100% in /)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set Jonas Keller to 75%' }));
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('clips load past the end of the scale with an end mark', () => {
    renderBar({ ...jonas, months: [{ month: '2026-11', onTeam: 60, otherTeams: 60, loads: [] }] }, 50);
    expect(screen.getByTestId('load-clipped')).toBeInTheDocument();
  });
});
