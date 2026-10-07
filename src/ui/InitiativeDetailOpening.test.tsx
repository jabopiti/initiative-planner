import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '@brand';
import type { Initiative, GateRecord } from '../data/types';
import { discoveryId, validationId, developmentId, discoveryPassed, initiativePageHarness } from './testing/initiativePage';

let initiative: Initiative;
const { puts, renderPage } = initiativePageHarness(() => initiative);

const ninetyChars = 'Payments platform consolidation across the checkout, invoicing and fraud detection systems';

const atValidation = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: 'i1',
  name: 'Onboarding Flow v2',
  teamId: 't1',
  status: 'Active',
  gates: { [discoveryId]: discoveryPassed },
  phases: { [validationId]: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
  ...overrides,
});

/** A phase row's own expand/collapse header (the button controlling its body), not the magic bar's text naming the phase. */
const phaseToggle = (label: string) => document.querySelector<HTMLElement>(`[aria-controls="phase-${defaultBrandPack.process.find((p) => p.label === label)!.id}"]`)!;

describe('The page opens on the current phase (§5.4, slice 056)', () => {
  it('expands the current phase with its gate panel right beneath it, the others collapsed', async () => {
    initiative = atValidation();
    renderPage();
    const panel = await screen.findByRole('region', { name: /Gate \/ Checklist — G2/ });
    expect(phaseToggle('Validation')).toHaveAttribute('aria-expanded', 'true');
    expect(phaseToggle('Development')).toHaveAttribute('aria-expanded', 'false');
    // The panel sits in the current phase's own list item, before the next phase's.
    const validationRow = document.getElementById(`phase-row-${validationId}`)!;
    expect(validationRow).toContainElement(panel);
    expect(validationRow.nextElementSibling).toHaveAttribute('id', `phase-row-${developmentId}`);
  });

  it('puts the panel under a phase without cost, and opens the next costed phase', async () => {
    initiative = { id: 'i1', name: 'Fraud Detection Upgrade', teamId: 't1', status: 'Active' };
    renderPage();
    const panel = await screen.findByRole('region', { name: /Gate \/ Checklist — G1/ });
    expect(document.getElementById(`phase-row-${discoveryId}`)).toContainElement(panel);
    expect(phaseToggle('Validation')).toHaveAttribute('aria-expanded', 'true');
    expect(phaseToggle('Development')).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps an older phase with an overdue actual collapsed, with a chip naming the month or the count', async () => {
    const skipped: GateRecord = { outcome: 'skipped', passedOn: '2026-08-01', checklist: [], skipReason: 'Known problem' };
    initiative = atValidation({
      gates: { [discoveryId]: discoveryPassed, [validationId]: skipped },
      phases: { [validationId]: { startDate: '2026-07-01', endDate: '2026-07-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    });
    renderPage();
    expect(await screen.findByText('No actual for Jul 2026')).toBeInTheDocument();
    expect(phaseToggle('Validation')).toHaveAttribute('aria-expanded', 'false');
    expect(phaseToggle('Development')).toHaveAttribute('aria-expanded', 'true');
    cleanup();

    initiative = { ...initiative, phases: { [validationId]: { startDate: '2026-05-01', endDate: '2026-07-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } } };
    renderPage();
    expect(await screen.findByText('3 actuals overdue')).toBeInTheDocument();
  });
});

describe('The gate panel lists every requirement it counts (§5.4, §8.1, slice 056)', () => {
  it('lists the estimates requirement first, so the count matches the rows', async () => {
    initiative = atValidation();
    renderPage();
    const panel = await screen.findByRole('region', { name: /Gate \/ Checklist — G2/ });
    expect(within(panel).getByText('0 of 4 complete')).toBeInTheDocument();
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Validation and Development have a period and at least one allocation or cost item');
    expect(rows[0]).toHaveTextContent('Open');
  });

  it('opens the phase missing one from Go to <phase>, and reads Met once every phase has one', async () => {
    const user = userEvent.setup();
    initiative = atValidation();
    renderPage();
    const panel = await screen.findByRole('region', { name: /Gate \/ Checklist — G2/ });
    await user.click(within(panel).getByRole('button', { name: 'Go to Development' }));
    expect(phaseToggle('Development')).toHaveAttribute('aria-expanded', 'true');
    await vi.waitFor(() => expect(phaseToggle('Development')).toHaveFocus());
    cleanup();

    initiative = atValidation({
      phases: {
        [validationId]: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
        [developmentId]: { startDate: '2026-12-01', endDate: '2027-03-31', allocations: [{ id: 'a2', personId: 'ana', allocationPct: 50 }] },
      },
    });
    renderPage();
    const metPanel = await screen.findByRole('region', { name: /Gate \/ Checklist — G2/ });
    expect(within(metPanel).getByText('1 of 4 complete')).toBeInTheDocument();
    expect(within(metPanel).getAllByRole('listitem')[0]).toHaveTextContent('Met');
    expect(within(metPanel).queryByRole('button', { name: /^Go to/ })).not.toBeInTheDocument();
  });
});

describe('The magic bar names its phases and what blocks the gate (§5.4, §9.10, slice 056)', () => {
  it('labels the current and next phase, and names every step with its state', async () => {
    initiative = atValidation();
    renderPage();
    const bar = await screen.findByRole('region', { name: 'Magic bar' });
    const steps = within(within(bar).getByRole('list', { name: 'Phases' })).getAllByRole('img');
    expect(steps.map((s) => s.getAttribute('aria-label'))).toEqual(['Discovery, done', 'Validation, current', 'Development, next', 'Rollout, ahead']);
    expect(steps.map((s) => s.textContent)).toEqual(['', 'Validation', 'Development', '']);
  });

  it('marks a phase behind a skipped gate as skipped', async () => {
    initiative = atValidation({ gates: { [discoveryId]: { outcome: 'skipped', passedOn: '2026-01-01', checklist: [], skipReason: 'Known' } } });
    renderPage();
    expect(await screen.findByRole('img', { name: 'Discovery, skipped' })).toBeInTheDocument();
  });

  it('shows a blocked Pass gate as an outline button with the open count, announced as disabled with the reason', async () => {
    const user = userEvent.setup();
    initiative = atValidation();
    renderPage();
    const pass = await screen.findByRole('button', { name: 'Pass gate · 4 open' });
    expect(pass).toHaveAttribute('aria-disabled', 'true');
    expect(pass).toHaveAccessibleDescription(/Development needs a complete period/);
    // Still selectable: it jumps to the first open requirement, passing nothing.
    await user.click(pass);
    expect(puts()).toHaveLength(0);
  });

  it('names the first blocker on the overrun line, and reads "1 day" for one day', async () => {
    initiative = atValidation({ phases: { [validationId]: { startDate: '2026-08-01', endDate: '2026-09-23', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } } });
    renderPage();
    const bar = await screen.findByRole('region', { name: 'Magic bar' });
    expect(within(bar).getByText('Validation is 1 day overrun ·')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /^Development needs a complete period .* \(\+3 more\)$/ })).toBeInTheDocument();
  });
});

describe('The header shows a long name in full (§5.4, slice 056)', () => {
  it('wraps the name in a field that commits on Enter', async () => {
    const user = userEvent.setup();
    initiative = atValidation({ name: ninetyChars });
    renderPage();
    const name = await screen.findByRole('textbox', { name: 'Initiative name' });
    expect(name.tagName).toBe('TEXTAREA');
    expect(name).toHaveValue(ninetyChars);
    await user.clear(name);
    await user.type(name, 'Onboarding Flow v3{Enter}');
    await vi.waitFor(() => expect(puts().at(-1)?.content.name).toBe('Onboarding Flow v3'), { timeout: 3000 });
  });
});
