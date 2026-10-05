import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplitBar, type SplitSegment } from './SplitBar';

/** Lucía Ramos (slice 062's path): Platform and Growth, Capacity 100%. */
const lucia = (platform: number, growth: number): SplitSegment[] => [
  { id: 'm-platform', name: 'Platform', pct: platform, colorClass: 'bg-team-1' },
  { id: 'm-growth', name: 'Growth', pct: growth, colorClass: 'bg-team-2' },
];

function renderBar(segments: SplitSegment[], capacityPct = 100) {
  const onMove = vi.fn();
  render(<SplitBar segments={segments} capacityPct={capacityPct} onMove={onMove} />);
  return {
    onMove,
    between: screen.getByRole('slider', { name: 'Divider between Platform and Growth' }),
    after: screen.getByRole('slider', { name: 'Divider after Growth' }),
  };
}
const pcts = (testId: string) => screen.queryAllByTestId(testId).map((el) => Number(el.dataset.pct));

afterEach(cleanup);

describe('SplitBar (§5.6, §9.5)', () => {
  it('shows a segment per team in its colour, with no hatched rest when all is claimed', () => {
    renderBar(lucia(60, 40));
    expect(pcts('split-segment')).toEqual([60, 40]);
    expect(screen.getAllByTestId('split-segment')[0]).toHaveClass('bg-team-1');
    expect(screen.getAllByTestId('split-segment')[1]).toHaveClass('bg-team-2');
    expect(screen.queryByTestId('split-unclaimed')).not.toBeInTheDocument();
  });

  it('hatches the unclaimed rest', () => {
    renderBar(lucia(60, 20));
    expect(pcts('split-unclaimed')).toEqual([20]);
  });

  it('steps a divider 5% with the arrow keys, announces both teams and saves both in one move on Enter', async () => {
    const user = userEvent.setup();
    const { between, onMove } = renderBar(lucia(60, 40));
    expect(between).toHaveAttribute('aria-valuetext', 'Platform 60%, Growth 40%');
    between.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(between).toHaveAttribute('aria-valuetext', 'Platform 70%, Growth 30%');
    expect(pcts('split-segment')).toEqual([70, 30]);
    expect(onMove).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith([
      { id: 'm-platform', teamFtePct: 70 },
      { id: 'm-growth', teamFtePct: 30 },
    ]);
  });

  it('announces the last divider with what is unclaimed, and never takes it past Capacity %', async () => {
    const user = userEvent.setup();
    const { after, onMove } = renderBar(lucia(60, 20), 90);
    expect(after).toHaveAttribute('aria-valuetext', 'Growth 20%, 10% unclaimed');
    after.focus();
    await user.keyboard('{End}');
    expect(after).toHaveAttribute('aria-valuetext', 'Growth 30%, 0% unclaimed');
    await user.keyboard('{ArrowRight}');
    expect(after).toHaveAttribute('aria-valuetext', 'Growth 30%, 0% unclaimed');
    await user.tab(); // leaving the divider saves
    expect(onMove).toHaveBeenCalledWith([{ id: 'm-growth', teamFtePct: 30 }]);
  });

  it('leaves every team at least 5%: Home and End go to the divider’s limits', async () => {
    const user = userEvent.setup();
    const { between } = renderBar(lucia(60, 40));
    between.focus();
    await user.keyboard('{Home}');
    expect(between).toHaveAttribute('aria-valuetext', 'Platform 5%, Growth 95%');
    await user.keyboard('{ArrowLeft}');
    expect(between).toHaveAttribute('aria-valuetext', 'Platform 5%, Growth 95%');
    await user.keyboard('{End}');
    expect(between).toHaveAttribute('aria-valuetext', 'Platform 95%, Growth 5%');
  });

  it('takes typed digits as the value of the team to the divider’s left', async () => {
    const user = userEvent.setup();
    const { between, onMove } = renderBar(lucia(60, 40));
    between.focus();
    await user.keyboard('75{Enter}');
    expect(onMove).toHaveBeenCalledWith([
      { id: 'm-platform', teamFtePct: 75 },
      { id: 'm-growth', teamFtePct: 25 },
    ]);
  });

  it('reverts on Esc without saving', async () => {
    const user = userEvent.setup();
    const { between, onMove } = renderBar(lucia(60, 40));
    between.focus();
    await user.keyboard('{ArrowRight}{Escape}');
    expect(between).toHaveAttribute('aria-valuetext', 'Platform 60%, Growth 40%');
    await user.tab();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('shows a fully hatched bar and no divider for a person on no team', () => {
    render(<SplitBar segments={[]} capacityPct={100} onMove={vi.fn()} />);
    expect(pcts('split-unclaimed')).toEqual([100]);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
