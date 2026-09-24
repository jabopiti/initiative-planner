import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TeamSelect } from './TeamSelect';

const teams = [
  { id: 't1', name: 'Platform', active: true },
  { id: 't2', name: 'Payments', active: true },
  { id: 't3', name: 'Legacy', active: false },
];

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(cleanup);

const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('TeamSelect (§5.1, §5.4)', () => {
  it('reads "Select team" with no value, and lists the active teams with none selected', async () => {
    render(<TeamSelect teams={teams} value="" onValueChange={() => {}} />);
    const trigger = screen.getByRole('combobox', { name: 'Team' });
    expect(trigger).toHaveTextContent('Select team');
    await userEvent.click(trigger);
    expect(optionNames()).toEqual(['Platform', 'Payments']);
    expect(screen.queryByRole('option', { selected: true })).toBeNull();
  });

  it('keeps a deactivated team listed and shown while it is the chosen one', async () => {
    render(<TeamSelect teams={teams} value="t3" onValueChange={() => {}} />);
    const trigger = screen.getByRole('combobox', { name: 'Team' });
    expect(trigger).toHaveTextContent('Legacy');
    await userEvent.click(trigger);
    expect(optionNames()).toEqual(['Platform', 'Payments', 'Legacy']);
  });

  it('reports the chosen team', async () => {
    const onValueChange = vi.fn();
    render(<TeamSelect teams={teams} value="" onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Team' }));
    await userEvent.click(screen.getByRole('option', { name: 'Payments' }));
    expect(onValueChange).toHaveBeenCalledWith('t2');
  });
});
