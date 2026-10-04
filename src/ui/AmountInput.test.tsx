import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmountDraftInput, AmountInput } from './AmountInput';

afterEach(cleanup);

describe('AmountInput (§9.11)', () => {
  it('shows the currency symbol inside the field, which holds a plain number as text', () => {
    render(<AmountInput label="Amount for Audit" currencySymbol="€" value={820} onChange={() => {}} />);
    const field = screen.getByRole('textbox', { name: 'Amount for Audit' });
    expect(field).toHaveValue('820');
    expect(field.parentElement).toHaveTextContent('€');
  });

  it('shows what a sum will save as before it saves, and saves it on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountInput label="Amount" currencySymbol="€" value={undefined} placeholder="Amount" onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Amount' });
    await user.type(field, '3 × 4k');
    expect(screen.getByText('Saves as €12,000')).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription('Saves as €12,000');
    expect(onChange).not.toHaveBeenCalled();
    await user.type(field, '{Enter}');
    expect(onChange).toHaveBeenCalledWith(12_000);
  });

  it('shows cents when the amount has them', async () => {
    const user = userEvent.setup();
    render(<AmountInput label="Amount" currencySymbol="€" value={undefined} onChange={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '1.2m / 7');
    expect(screen.getByText('Saves as €171,428.57')).toBeInTheDocument();
  });

  it('shows no "Saves as" line for a plain number, and saves it on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountInput label="Amount" currencySymbol="€" value={undefined} onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '820');
    expect(screen.queryByText(/Saves as/)).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(820);
  });

  it('stays quiet about an unfinished sum while typing, then says why on commit and saves nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountInput label="Amount" currencySymbol="€" value={undefined} onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Amount' });
    await user.type(field, '3 ×');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Saves as/)).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent("Can't read that as an amount. Try 12k or 3 × 4k.");
    expect(field).toBeInvalid();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['abc', "Can't read that as an amount. Try 12k or 3 × 4k."],
    ['1/0', "Can't divide by 0."],
    ['-3', "An amount can't be below 0."],
    ['9,999,999,999,999 × 9', 'That amount is too large.'],
    ['', 'Enter a day rate of 0 or more.'],
  ])('refuses %j with its reason and makes no write', async (text, reason) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountInput label="Day rate" currencySymbol="€" value={500} refusal="Enter a day rate of 0 or more." onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Day rate' });
    await user.clear(field);
    if (text) await user.type(field, text);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(reason);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts the saved amount back on Esc', async () => {
    const user = userEvent.setup();
    render(<AmountInput label="Amount" currencySymbol="€" value={500} onChange={() => {}} />);
    const field = screen.getByRole('textbox', { name: 'Amount' });
    await user.clear(field);
    await user.type(field, '12k{Escape}');
    expect(field).toHaveValue('500');
  });

  it('puts a sum that equals the saved amount back as that amount, without a write', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountInput label="Amount" currencySymbol="€" value={12_000} onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Amount' });
    await user.clear(field);
    await user.type(field, '3 × 4k{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue('12000');
  });

  it('leaves room for a longer currency symbol', () => {
    render(<AmountInput label="Amount" currencySymbol="CHF" value={1} onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveClass('pl-11');
  });
});

describe('AmountDraftInput (§9.11)', () => {
  function Draft({ error }: { error?: string }) {
    const [text, setText] = useState('');
    return <AmountDraftInput aria-label="Amount" placeholder="Amount" currencySymbol="€" value={text} error={error} onChange={setText} />;
  }

  it('shows the symbol inside the field and the "Saves as" line while typing a sum', async () => {
    const user = userEvent.setup();
    render(<Draft />);
    const field = screen.getByRole('textbox', { name: 'Amount' });
    expect(field.parentElement).toHaveTextContent('€');
    await user.type(field, '18k + 2.4k');
    expect(screen.getByText('Saves as €20,400')).toBeInTheDocument();
  });

  it('shows the form\'s refusal instead of the "Saves as" line', async () => {
    const user = userEvent.setup();
    render(<Draft error="Can't divide by 0." />);
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '1/0');
    expect(screen.getByRole('alert')).toHaveTextContent("Can't divide by 0.");
    expect(screen.getByRole('textbox', { name: 'Amount' })).toBeInvalid();
  });
});
