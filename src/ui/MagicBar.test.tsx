import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Initiative, GateRecord } from '../data/types';
import { discoveryId, validationId, developmentId, g1, discoveryPassed, initiativePageHarness } from './testing/initiativePage';
import { findPhases } from '../test/phases';

let initiative: Initiative;
const { puts, renderPage } = initiativePageHarness(() => initiative);

describe('Extend an overrun phase by one month (§5.11)', () => {
  it('offers the extend action only in the overrun state (AC1)', async () => {
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: { [validationId]: { startDate: '2020-07-01', endDate: '2020-08-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    renderPage();

    expect(await screen.findByText(/Validation is \d+ days overrun/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extend Validation by one month' })).toBeInTheDocument();
  });

  it('does not offer the extend action outside the overrun state', async () => {
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: { [validationId]: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    renderPage();

    await screen.findByRole('heading', { name: /Gate \/ Checklist/ });
    expect(screen.queryByRole('button', { name: /Extend .* by one month/ })).not.toBeInTheDocument();
  });

  it('moves the end date a month later in one commit naming the new date, applying the month-end rule (AC2, AC3)', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: {
        [validationId]: { startDate: '2020-07-01', endDate: '2020-08-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] },
        [developmentId]: { startDate: '2020-09-01', endDate: '2020-10-31', allocations: [] },
      },
    };
    renderPage();

    const extend = await screen.findByRole('button', { name: 'Extend Validation by one month' });
    await user.click(extend);

    await vi.waitFor(() => expect(puts().some((p) => p.message.includes('Validation extended to'))).toBe(true), { timeout: 3000 });
    const put = puts().find((p) => p.message.includes('Validation extended to'))!;
    expect(put.message).toBe('Checkout Redesign: Validation extended to 30 Sep 2020');
    expect(put.content.phases![validationId].endDate).toBe('2020-09-30'); // 31 Aug (last day) -> 30 Sept (next month's last day)
    expect(put.content.phases![developmentId]).toEqual(initiative.phases![developmentId]); // later phase untouched (AC4)
  });

  it('still shows the overrun state and the action when the phase remains overrun after extending (AC5)', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Checkout Redesign',
      teamId: 't1',
      status: 'Active',
      gates: { [discoveryId]: discoveryPassed },
      phases: { [validationId]: { startDate: '2020-01-01', endDate: '2020-01-31', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Extend Validation by one month' }));

    expect(await screen.findByText(/Validation is \d+ days overrun/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extend Validation by one month' })).toBeInTheDocument();
    // Its commit lands before the test ends, so it can't show up in a later test's writes.
    await vi.waitFor(() => expect(puts().map((p) => p.message)).toContain('Checkout Redesign: Validation extended to 29 Feb 2020'), { timeout: 3000 });
  });
});

describe('Skip a skippable gate with a reason (§8.2)', () => {
  const atValidation = (overrides: Partial<Initiative> = {}): Initiative => ({
    id: 'i1',
    name: 'Onboarding Flow v2',
    teamId: 't1',
    status: 'Active',
    gates: { [discoveryId]: discoveryPassed },
    phases: { [validationId]: { startDate: '2026-10-01', endDate: '2026-11-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    ...overrides,
  });
  const g2Passed: GateRecord = { outcome: 'passed', passedOn: '2026-02-01', checklist: [] };

  it('offers Skip G2 beside Pass gate on a skippable gate, and nothing on a non-skippable one', async () => {
    initiative = atValidation();
    renderPage();
    expect(await screen.findByRole('button', { name: 'Skip G2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pass gate/ })).toBeInTheDocument();
    cleanup();

    initiative = atValidation({ gates: { [discoveryId]: discoveryPassed, [validationId]: g2Passed } });
    renderPage();
    await screen.findByRole('button', { name: /^Pass gate/ });
    expect(screen.queryByRole('button', { name: /^Skip G/ })).not.toBeInTheDocument();
  });

  it('answers a Skip while On Hold with the on-hold message, saving nothing', async () => {
    const user = userEvent.setup();
    initiative = atValidation({ status: 'On Hold' });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Skip G2' }));
    expect(screen.getByText('Onboarding Flow v2 is on hold. Resume it to skip G2.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Reason for skipping G2')).not.toBeInTheDocument();
    expect(puts()).toEqual([]);
  });

  it('opens a focused reason field with Skip G2 disabled until a non-blank reason, and Esc or Cancel saves nothing', async () => {
    const user = userEvent.setup();
    initiative = atValidation();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Skip G2' }));

    const field = screen.getByLabelText('Reason for skipping G2');
    expect(field).toHaveFocus();
    expect(screen.queryByRole('button', { name: /^Pass gate/ })).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Skip G2' });
    expect(confirm).toBeDisabled();
    await user.type(field, '   ');
    expect(confirm).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(field).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Reason for skipping G2')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip G2' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Skip G2' }));
    await user.type(screen.getByLabelText('Reason for skipping G2'), 'Not needed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: /^Pass gate/ })).toBeInTheDocument();
    expect(puts()).toEqual([]);
  });

  it('skips with the trimmed reason in one commit, despite open items, then offers Reopen, which removes the record', async () => {
    const user = userEvent.setup();
    initiative = atValidation();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Skip G2' }));
    await user.type(screen.getByLabelText('Reason for skipping G2'), '  Problem validated in the Q2 pilot.  {Enter}');

    expect(screen.getByText('Skipped G2')).toBeInTheDocument();
    await vi.waitFor(() => expect(puts().some((p) => p.message === 'Onboarding Flow v2: G2 skipped')).toBe(true), { timeout: 3000 });
    const record = puts().find((p) => p.message === 'Onboarding Flow v2: G2 skipped')!.content.gates![validationId];
    expect(record).toMatchObject({ outcome: 'skipped', skipReason: 'Problem validated in the Q2 pilot.' });
    expect(record.passedOn).toBeUndefined();
    expect(record.frozenSnapshot).toBeUndefined();
    expect(record.recordedGrandEstimate).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    await vi.waitFor(() => expect(puts().some((p) => p.message === 'Onboarding Flow v2: G2 reopened')).toBe(true), { timeout: 3000 });
    expect(puts().find((p) => p.message === 'Onboarding Flow v2: G2 reopened')!.content.gates![validationId]).toBeUndefined();
  });
});

describe('A skipped phase on the Phases list (§8.2)', () => {
  it('reads "Skipped" with the skip icon and its reason, and stays editable', async () => {
    const user = userEvent.setup();
    initiative = {
      id: 'i1',
      name: 'Onboarding Flow v2',
      teamId: 't1',
      status: 'Active',
      gates: {
        [discoveryId]: { outcome: 'skipped', skipReason: 'Validated in an earlier pilot.', checklist: [] },
        [validationId]: { outcome: 'skipped', skipReason: 'Problem validated in the Q2 pilot.', checklist: [] },
      },
      phases: { [validationId]: { startDate: '2026-07-01', endDate: '2026-09-30', allocations: [{ id: 'a1', personId: 'ana', allocationPct: 50 }] } },
    };
    renderPage();

    const discovery = (await findPhases()).getByText('Discovery').parentElement!;
    expect(within(discovery).getByRole('img', { name: 'Skipped' })).toBeInTheDocument();
    expect(within(discovery).getByText('· Skipped G1')).toBeInTheDocument();
    expect(within(discovery).getByText('· Validated in an earlier pilot.')).toBeInTheDocument();

    const validationLine = screen.getByRole('button', { name: /^SkippedValidation/ });
    expect(within(validationLine).getByRole('img', { name: 'Skipped' })).toBeInTheDocument();
    expect(within(validationLine).getByText('· Skipped G2')).toBeInTheDocument();
    if (validationLine.getAttribute('aria-expanded') === 'false') await user.click(validationLine);
    expect(screen.getByText('Skipped G2:').parentElement).toHaveTextContent('Skipped G2: Problem validated in the Q2 pilot.');
    expect(screen.getByLabelText('Validation start date')).toBeEnabled();
  });
});

describe('Choose a starting phase for an untouched initiative (§8.2)', () => {
  const untouched = (): Initiative => ({
    id: 'i1',
    name: 'Checkout Redesign',
    teamId: 't1',
    status: 'Active',
    defaultPlan: true,
    phases: {
      [validationId]: { startDate: '2026-09-24', endDate: '2026-12-23', allocations: [] },
      [developmentId]: { startDate: '2026-12-24', endDate: '2027-06-23', allocations: [] },
    },
  });
  const REASON = 'In development since May, before the tool.';

  /** A new initiative's page, with the starting-phase form open. */
  async function openStartForm() {
    const user = userEvent.setup();
    initiative = untouched();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Start at a later phase' }));
    return user;
  }

  async function choose(user: ReturnType<typeof userEvent.setup>, phase: string) {
    await user.click(screen.getByRole('combobox', { name: 'Start at' }));
    await user.click(await screen.findByRole('option', { name: phase }));
  }

  it('offers Start at a later phase on a new initiative, and opens the form with nothing chosen (AC1, AC4)', async () => {
    await openStartForm();
    expect(screen.getByRole('combobox', { name: 'Start at' })).toHaveFocus();
    expect(screen.getByRole('combobox', { name: 'Start at' })).toHaveTextContent('Choose a phase');
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Pass gate/ })).not.toBeInTheDocument();
  });

  it('names the skipped gates and records them in one commit, then reads Change starting phase (AC5)', async () => {
    const user = await openStartForm();
    await choose(user, 'Development');
    const reason = screen.getByLabelText('Reason for skipping G1 and G2');
    expect(screen.getByRole('button', { name: 'Start at Development' })).toBeDisabled();
    await user.type(reason, REASON);
    await user.click(screen.getByRole('button', { name: 'Start at Development' }));

    const change = await screen.findByRole('button', { name: 'Change starting phase' });
    expect(change).toHaveFocus();
    await vi.waitFor(() => expect(puts().map((p) => p.message)).toEqual(['Checkout Redesign: starts at Development']));
    expect(puts()[0].content.gates?.[validationId]).toMatchObject({ outcome: 'skipped', skipReason: REASON, startingPhase: true });
    expect(screen.queryByText('Skipped G2')).not.toBeInTheDocument();
  });

  it('names G3 too for Rollout, and needs no reason for Discovery once a start is set (AC6)', async () => {
    const user = await openStartForm();
    await choose(user, 'Rollout');
    expect(screen.getByLabelText('Reason for skipping G1, G2 and G3')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reason for skipping G1, G2 and G3'), 'Live already{Enter}');

    await user.click(await screen.findByRole('button', { name: 'Change starting phase' }));
    await choose(user, 'Discovery');
    expect(screen.queryByLabelText(/^Reason/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start at Discovery' })).toBeEnabled();
    // The start's save settles here, not in the next test's capture.
    await vi.waitFor(() => expect(puts().map((p) => p.message)).toEqual(['Checkout Redesign: starts at Rollout']), { timeout: 3000 });
  });

  it('cancels with Esc, nothing saved, focus back on the action (AC4)', async () => {
    const user = await openStartForm();
    await choose(user, 'Validation');
    await user.type(screen.getByLabelText('Reason for skipping G1'), 'Half done{Escape}');
    expect(screen.getByRole('button', { name: 'Start at a later phase' })).toHaveFocus();
    expect(screen.queryByRole('combobox', { name: 'Start at' })).not.toBeInTheDocument();
    expect(puts()).toEqual([]);
  });

  it('is not offered once touched, nor on hold (AC3, AC11)', async () => {
    initiative = { ...untouched(), checklist: { [discoveryId]: { [g1.checklistItems[0].id]: { status: 'complete', note: '' } } } };
    renderPage();
    await screen.findByRole('button', { name: /^Pass gate/ });
    expect(screen.queryByRole('button', { name: /starting phase|later phase/ })).not.toBeInTheDocument();
    cleanup();

    initiative = { ...untouched(), status: 'On Hold' };
    renderPage();
    await screen.findByRole('button', { name: 'Resume' });
    expect(screen.queryByRole('button', { name: /starting phase|later phase/ })).not.toBeInTheDocument();
  });
});
