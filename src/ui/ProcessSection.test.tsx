import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultBrandPack } from '@brand';
import { BrandProvider } from '../state/BrandContext';
import { ProcessSection } from './ProcessSection';

afterEach(cleanup);

function renderProcess() {
  render(
    <BrandProvider brand={defaultBrandPack}>
      <ProcessSection />
    </BrandProvider>,
  );
}

describe('Settings → Process (§5.9)', () => {
  it('lists each phase with its description and, when costed, its default duration', () => {
    renderProcess();
    const development = screen.getByRole('heading', { name: /Development/ }).closest('li')!;
    expect(within(development).getByText('6 months')).toBeInTheDocument();
    expect(within(development).getByText('Build the initiative.')).toBeInTheDocument();
    const discovery = screen.getByRole('heading', { name: /Discovery/ }).closest('li')!;
    expect(within(discovery).queryByText(/month/)).toBeNull();
  });

  it('shows each gate with its estimates and skippable flags and its checklist count', () => {
    renderProcess();
    const g3 = screen.getByText('G3').closest('summary')!;
    expect(within(g3).getByText('Requires estimates')).toBeInTheDocument();
    expect(within(g3).getByText('Cannot be skipped')).toBeInTheDocument();
    expect(within(g3).getByText('3 checklist items')).toBeInTheDocument();
    const g1 = screen.getByText('G1').closest('summary')!;
    expect(within(g1).getByText('No estimates required')).toBeInTheDocument();
    expect(within(g1).getByText('Can be skipped')).toBeInTheDocument();
  });

  it('opens a gate to list its checklist items', async () => {
    const user = userEvent.setup();
    renderProcess();
    const g3 = screen.getByText('G3').closest('details')!;
    expect(g3).not.toHaveAttribute('open');
    await user.click(screen.getByText('G3'));
    expect(g3).toHaveAttribute('open');
    expect(within(g3).getByText('Security review completed')).toBeInTheDocument();
  });

  it('lists the approval tracks with bounds, requirement text and severity', () => {
    renderProcess();
    const standard = screen.getByRole('cell', { name: 'Standard (S)' }).closest('tr')!;
    expect(within(standard).getByText('€50,000 – €200,000')).toBeInTheDocument();
    expect(within(standard).getByText('Requires department head approval')).toBeInTheDocument();
    expect(within(standard).getByText('2')).toBeInTheDocument();
    const elevated = screen.getByRole('cell', { name: 'Elevated (E)' }).closest('tr')!;
    expect(within(elevated).getByText('€200,000 and above')).toBeInTheDocument();
  });
});
