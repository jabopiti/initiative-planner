import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { byLabel, FilterChip } from './FilterChip';

const options = [
  { value: 'a', label: 'Active' },
  { value: 'h', label: 'On Hold' },
  { value: 'c', label: 'Cancelled' },
];

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

function Harness({ initial = [] as string[] }) {
  const [selected, setSelected] = useState(initial);
  return (
    <>
      <FilterChip label="Status" options={options} selected={selected} onChange={setSelected} />
      <output data-testid="selected">{selected.join(',')}</output>
    </>
  );
}

const chip = () => screen.getByRole('button', { name: /^Status/ });

describe('FilterChip (§9.11)', () => {
  it('shows the count when active and the bare label otherwise', () => {
    render(<Harness initial={['a', 'h']} />);
    expect(chip()).toHaveTextContent('Status: 2');
  });

  it('opens with Enter, focuses the search field, and lists one checkbox per option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(chip()).toHaveTextContent(/^Status$/);
    chip().focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('textbox', { name: 'Search status' })).toHaveFocus();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('opens with Space', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    chip().focus();
    await user.keyboard(' ');
    expect(await screen.findByRole('textbox', { name: 'Search status' })).toBeInTheDocument();
  });

  it('narrows the options to those matching the search text', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(chip());
    await user.type(await screen.findByRole('textbox', { name: 'Search status' }), 'hold');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'On Hold' })).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Search status' }));
    await user.type(screen.getByRole('textbox', { name: 'Search status' }), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('toggles by click; the chip names one chosen value and counts two or more', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(chip());
    await user.click(await screen.findByRole('checkbox', { name: 'On Hold' }));
    expect(screen.getByTestId('selected')).toHaveTextContent('h');
    expect(chip()).toHaveTextContent('Status: On Hold');
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    expect(chip()).toHaveTextContent('Status: 2');
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    await user.click(screen.getByRole('checkbox', { name: 'On Hold' }));
    expect(screen.getByTestId('selected')).toHaveTextContent(/^$/);
  });

  it('moves with the arrow keys, toggles with Space and Enter, and returns to search with Up', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    chip().focus();
    await user.keyboard('{Enter}');
    const search = await screen.findByRole('textbox', { name: 'Search status' });
    expect(search).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('checkbox', { name: 'Active' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('checkbox', { name: 'On Hold' })).toHaveFocus();

    await user.keyboard(' ');
    expect(screen.getByTestId('selected')).toHaveTextContent('h');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByTestId('selected')).toHaveTextContent('h,c');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('selected')).toHaveTextContent(/^h$/);

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('checkbox', { name: 'Active' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(search).toHaveFocus();
  });

  it('closes with Esc and puts focus back on the chip', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    chip().focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('textbox', { name: 'Search status' });
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Search status' })).not.toBeInTheDocument();
    expect(chip()).toHaveFocus();
  });

  it('sorts A–Z with the options ticked at opening first, and keeps that order while open (F28)', async () => {
    const user = userEvent.setup();
    const teams = byLabel([
      { value: 'p', label: 'Platform' },
      { value: 'g', label: 'Growth' },
      { value: 'y', label: 'Payments' },
    ]);
    function TeamHarness() {
      const [selected, setSelected] = useState(['p']);
      return <FilterChip label="Team" options={teams} selected={selected} onChange={setSelected} selectedFirst />;
    }
    render(<TeamHarness />);
    await user.click(screen.getByRole('button', { name: /^Team/ }));
    const labels = () => screen.getAllByRole('checkbox').map((c) => c.parentElement?.textContent);
    expect(labels()).toEqual(['Platform', 'Growth', 'Payments']);
    await user.click(screen.getByRole('checkbox', { name: 'Payments' }));
    expect(labels()).toEqual(['Platform', 'Growth', 'Payments']);
  });
});
