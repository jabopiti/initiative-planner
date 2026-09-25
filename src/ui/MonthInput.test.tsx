import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MonthInput } from './MonthInput';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe('Month input (§9.11)', () => {
  it('commits a typed month on Enter and on leaving the field, and shows it as "Sep 2026"', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MonthInput label="Month" value={undefined} onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Month' });
    await user.type(field, 'september 2026{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('2026-09');
    expect(field).toHaveValue('Sep 2026');
    await user.clear(field);
    await user.type(field, '2027-01');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith('2027-01');
  });

  it('is fully operable by keyboard: ↓ enters the months, Enter picks one, Esc closes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MonthInput label="Month" value="2026-09" onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Month' });
    await user.click(field);
    expect(await screen.findByText('2026')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Sep 2026' })).toHaveFocus());
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Oct 2026' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('2026-10');
    expect(field).toHaveValue('Oct 2026');
    expect(screen.queryByRole('button', { name: 'Next year' })).not.toBeInTheDocument();

    await user.click(field);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Next year' })).not.toBeInTheDocument();
  });

  it('steps the year, and marks the selected month as pressed', async () => {
    const user = userEvent.setup();
    render(<MonthInput label="Month" value="2026-09" onChange={() => {}} />);
    await user.click(screen.getByRole('textbox', { name: 'Month' }));
    expect(await screen.findByRole('button', { name: 'Sep 2026' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(screen.getByRole('button', { name: 'Sep 2025' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('refuses an empty field when required, and clears the month when it is not', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<MonthInput label="Month" required value="2026-09" onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Month' });
    await user.clear(field);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a month such as Sep 2026.');
    expect(onChange).not.toHaveBeenCalled();

    rerender(<MonthInput label="Month" value="2026-09" onChange={onChange} />);
    await user.clear(field);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
