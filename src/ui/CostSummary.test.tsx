import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultBrandPack } from '../brand/defaultBrand';
import type { BrandPack } from '../brand/types';
import { buildBaselineDataset } from '../data/baseline';
import { formatPeriod } from '../data/dates';
import { buildExampleData } from '../data/exampleDataset';
import type { Initiative } from '../data/types';
import type { RepositoryState } from '../sync/Repository';
import { BrandProvider } from '../state/BrandContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CostSummary } from './CostSummary';

let state: Partial<RepositoryState>;
let listeners: Set<() => void>;
vi.mock('../state/DataContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useRepositoryState: () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state),
  };
});

const { roles, countries } = buildBaselineDataset(defaultBrandPack);
const example = buildExampleData(defaultBrandPack, { roles, countries }, new Date(2026, 9, 4));
const named = (name: string) => structuredClone(example.initiatives.find((i) => i.name === name)!);
const process = defaultBrandPack.process;
const [, validation, development] = process;

const page = (initiative: Initiative, brand: BrandPack) => (
  <BrandProvider brand={brand}>
    <TooltipProvider>
      <CostSummary initiative={initiative} />
    </TooltipProvider>
  </BrandProvider>
);
let rerender: (ui: React.ReactNode) => void;
function show(initiative: Initiative, brand: BrandPack = defaultBrandPack) {
  state = { ...example, roles, countries, initiatives: [initiative] };
  ({ rerender } = render(page(initiative, brand)));
}
/** A change to the initiative while the page is open, as the page receives it: new data and a new prop. */
const update = (initiative: Initiative) => {
  state = { ...state, initiatives: [initiative] };
  act(() => rerender(page(initiative, defaultBrandPack)));
};
const tile = (label: string) => screen.getByText(label, { selector: 'span' }).closest<HTMLElement>('.rounded-card')!;
const reducedMotion = (reduce: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);

beforeEach(() => {
  listeners = new Set();
  reducedMotion(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Key figures (§5.4, slice 059)', () => {
  it('shows the four figures; no approved-at line before a costed gate has passed', () => {
    const onboarding = named('Onboarding Flow v2');
    show(onboarding);
    expect(within(tile('Grand estimate')).getByText('€59,008')).toBeInTheDocument();
    expect(screen.queryByText(/^Approved at/)).toBeNull();
    expect(within(tile('Deviation')).getByText('€0')).toBeInTheDocument();
    expect(screen.getByText('No actuals recorded yet')).toBeInTheDocument();
    const plan = onboarding.phases![validation.id];
    expect(within(tile('Current phase')).getByText('Validation')).toBeInTheDocument();
    expect(within(tile('Current phase')).getByText(formatPeriod(plan.startDate!, plan.endDate!))).toBeInTheDocument();
    expect(within(tile('Gate G2')).getByText('0 of 4 complete')).toBeInTheDocument();
    expect(within(tile('Gate G2')).getByText(/^\d+ open$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy cost summary' })).toBeInTheDocument();
  });

  it('shows what it was approved at, and the bullet bar with three bands, the bar ending in Elevated and the tick (Checkout Redesign)', () => {
    show(named('Checkout Redesign'));
    expect(screen.getByText('Approved at G2: €394,800')).toBeInTheDocument();
    expect(screen.getByText('Unchanged since G2')).toBeInTheDocument();
    const bar = screen.getByRole('img', { name: '€394,800 against the approval tracks, approved at €394,800' });
    expect(within(bar).getAllByTestId('bullet-band')).toHaveLength(3);
    // Scale: twice the highest finite bound, €400k; Elevated starts at €200k = 50%.
    const width = within(bar).getByTestId('bullet-estimate').style.width;
    expect(parseFloat(width)).toBeCloseTo(98.7, 1);
    expect(parseFloat(width)).toBeGreaterThan(50);
    expect(within(bar).getByTestId('bullet-approved').style.left).toBe(width);
    expect(within(bar).queryByTestId('bullet-clipped')).toBeNull();
    expect(bar).not.toHaveAttribute('data-escalated');
  });

  it('reads the difference since the gate and the deviation with its months, actuals as the inner bar', () => {
    const checkout = named('Checkout Redesign');
    const dev = checkout.phases![development.id];
    dev.actualMonths = { '2026-10': 1_000_000 };
    show(checkout);
    expect(screen.getByText(/^\+€[\d,]+ since G2$/)).toBeInTheDocument();
    expect(screen.getByText('Over estimate · 1 month recorded')).toBeInTheDocument();
    expect(within(tile('Deviation')).getByText(/^\+€/).parentElement).toHaveClass('text-warning-text');
    const bar = screen.getByRole('img', { name: /€1,000,000 actuals recorded$/ });
    expect(within(bar).getByTestId('bullet-actuals')).toBeInTheDocument();
    expect(within(bar).getByTestId('bullet-clipped')).toBeInTheDocument(); // past €400k
    // Approved in Elevated, still Elevated: not escalated.
    expect(bar).not.toHaveAttribute('data-escalated');
  });

  it('puts the bar and the difference in Warning while escalated (§7.4, §9.8)', () => {
    const checkout = named('Checkout Redesign');
    checkout.gates![validation.id].recordedApprovalTrack = { id: 'standard', name: 'Standard', severity: 2 };
    show(checkout);
    expect(screen.getByTestId('bullet-bar')).toHaveAttribute('data-escalated', 'true');
    expect(screen.getByTestId('bullet-estimate')).toHaveClass('bg-warning');
    expect(screen.getByText('Unchanged since G2')).toHaveClass('text-warning-text');
  });

  it('leaves a gap between two bands unshaded (§7.4)', () => {
    const tracks = [
      { ...defaultBrandPack.approvalTracks[0], upperBound: 40_000 },
      ...defaultBrandPack.approvalTracks.slice(1),
    ];
    show(named('Onboarding Flow v2'), { ...defaultBrandPack, approvalTracks: tracks });
    const [light, standard] = screen.getAllByTestId('bullet-band');
    expect(parseFloat(light.style.left) + parseFloat(light.style.width)).toBe(10); // €40k of €400k
    expect(parseFloat(standard.style.left)).toBe(12.5); // €50k: the €40k–50k gap is not shaded
  });

  it('says a current phase has no period yet', () => {
    show(named('Fraud Detection Upgrade'));
    expect(within(tile('Current phase')).getByText('No period yet')).toBeInTheDocument();
  });

  it('reads a Closed initiative as closed after its final gate, with all gates passed', () => {
    const checkout = named('Checkout Redesign');
    const passed = checkout.gates![validation.id];
    for (const phase of process) checkout.gates![phase.id] ??= { ...passed, frozenSnapshot: undefined };
    checkout.status = 'Closed';
    show(checkout);
    expect(within(tile('Current phase')).getByText('Closed')).toBeInTheDocument();
    expect(within(tile('Current phase')).getByText('after G4')).toBeInTheDocument();
    expect(within(tile('Gates')).getByText('All passed')).toBeInTheDocument();
    expect(within(tile('Gates')).getByText('G1 – G4')).toBeInTheDocument();
  });
});

describe('Key figure motion (slice 059, §9.5)', () => {
  it('rolls to a new value with a brief tint, never on first render', async () => {
    reducedMotion(false);
    const checkout = named('Checkout Redesign');
    show(checkout);
    const figure = () => within(tile('Grand estimate')).getByText(/^€[\d,]+$/);
    expect(figure()).not.toHaveClass('motion-safe:animate-recalc');
    const next = structuredClone(checkout);
    next.phases![development.id].allocations[0].allocationPct += 10;
    update(next);
    expect(figure()).toHaveClass('motion-safe:animate-recalc');
    await vi.waitFor(() => expect(figure().textContent).not.toBe('€394,800'));
  });

  it('shows the new value at once, with no tint, under reduced motion', () => {
    const checkout = named('Checkout Redesign');
    show(checkout);
    const next = structuredClone(checkout);
    next.phases![development.id].actualMonths = { '2026-10': 1 };
    update(next);
    const deviation = within(tile('Deviation')).getByText(/€/);
    expect(deviation.textContent).not.toBe('€0');
    expect(deviation).not.toHaveClass('motion-safe:animate-recalc');
  });
});
