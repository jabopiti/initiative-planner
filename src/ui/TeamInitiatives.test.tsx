import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { Initiative, Team } from '../data/types';
import { BrandProvider } from '../state/BrandContext';
import { RepositoryProvider } from '../state/DataContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NewInitiativeDraft } from './NewInitiativeDraft';
import { TeamDetail } from './TeamDetail';
import { fakeOnDemand, seedFiles } from '../sync/testing/fakeGithub';

const { process } = defaultBrandPack;
const passed = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { outcome: 'passed' as const, passedOn: '2025-12-01', checklist: [] }]));

const PLATFORM: Team = { id: 't1', name: 'Platform', active: true };
const RETIRED: Team = { id: 't2', name: 'Retired', active: false };
const fraud: Initiative = { id: 'fr', name: 'Fraud Detection Upgrade', teamId: 't1', status: 'Active' };
const checkout: Initiative = { id: 'co', name: 'Checkout Redesign', teamId: 't1', status: 'Active', gates: passed([process[0].id]) };
const closed: Initiative = { id: 'cl', name: 'Alpha Closed', teamId: 't1', status: 'Closed', gates: passed(process.map((p) => p.id)) };
const other: Initiative = { id: 'ot', name: 'Other Team Work', teamId: 't3', status: 'Active' };

let teams: Team[] = [];
let initiatives: Initiative[] = [];

const served = fakeOnDemand((fake) => seedFiles(fake, { teams, initiatives }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
beforeEach(() => {
  teams = [PLATFORM, RETIRED, { id: 't3', name: 'Growth', active: true }];
  initiatives = [];
  window.location.hash = '';
});

function renderWith(ui: React.ReactNode) {
  return render(
    <BrandProvider brand={defaultBrandPack}>
      <TooltipProvider>
        <RepositoryProvider token="token">{ui}</RepositoryProvider>
      </TooltipProvider>
    </BrandProvider>,
  );
}

const section = async () => within(await screen.findByRole('region', { name: 'Initiatives' }));

describe('Team page Initiatives list (§5.8)', () => {
  it("lists the team's initiatives in every status by phase, then name", async () => {
    initiatives = [closed, checkout, fraud, other];
    renderWith(<TeamDetail id="t1" />);
    const list = await section();
    await vi.waitFor(() => expect(list.getAllByRole('row')).toHaveLength(4));
    const rows = list.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(rows).toEqual([
      ['Fraud Detection Upgrade', process[0].label, 'Active'],
      ['Checkout Redesign', process[1].label, 'Active'],
      ['Alpha Closed', process[process.length - 1].label, 'Closed'],
    ]);
    expect(list.queryByText('Other Team Work')).not.toBeInTheDocument();
  });

  it('a name opens the initiative', async () => {
    const user = userEvent.setup();
    initiatives = [fraud];
    renderWith(<TeamDetail id="t1" />);
    await user.click(await (await section()).findByRole('link', { name: 'Fraud Detection Upgrade' }));
    expect(window.location.hash).toBe('#/initiatives/fr');
  });

  it('New initiative opens the draft with the team preselected and the name focused', async () => {
    const user = userEvent.setup();
    initiatives = [fraud];
    renderWith(<TeamDetail id="t1" />);
    await user.click(await (await section()).findByRole('button', { name: 'New initiative' }));
    expect(window.location.hash).toBe('#/initiatives/new?team=t1');
    cleanup();
    renderWith(<NewInitiativeDraft presetTeamId="t1" />);
    const field = await screen.findByPlaceholderText('Name this initiative');
    expect(field).toHaveFocus();
    await vi.waitFor(() => expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Platform'));
    expect(screen.getByRole('status')).toHaveTextContent('Next: name the initiative.');
  });

  it('a draft opened without a preset, or with an inactive or unknown team, starts on Select team', async () => {
    renderWith(<NewInitiativeDraft presetTeamId="t2" />);
    expect(await screen.findByRole('combobox', { name: 'Team' })).toHaveTextContent('Select team');
    cleanup();
    renderWith(<NewInitiativeDraft presetTeamId="nope" />);
    expect(await screen.findByRole('combobox', { name: 'Team' })).toHaveTextContent('Select team');
  });

  it('no initiatives: the line carries the one action', async () => {
    const user = userEvent.setup();
    renderWith(<TeamDetail id="t1" />);
    const list = await section();
    expect(await list.findByText(/No initiatives yet/)).toBeInTheDocument();
    expect(list.getAllByRole('button')).toHaveLength(1);
    await user.click(list.getByRole('button', { name: 'New initiative' }));
    expect(window.location.hash).toBe('#/initiatives/new?team=t1');
  });

  it('an inactive team: no action, empty or not', async () => {
    renderWith(<TeamDetail id="t2" />);
    expect(await (await section()).findByText('No initiatives.')).toBeInTheDocument();
    expect((await section()).queryByRole('button')).not.toBeInTheDocument();
    cleanup();
    served.fake().seed('initiatives/rf.json', { ...fraud, id: 'rf', teamId: 't2' });
    renderWith(<TeamDetail id="t2" />);
    const list = await section();
    expect(await list.findByRole('link', { name: 'Fraud Detection Upgrade' })).toBeInTheDocument();
    expect(list.queryByRole('button', { name: 'New initiative' })).not.toBeInTheDocument();
  });
});
