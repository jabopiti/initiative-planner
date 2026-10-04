import { useMemo } from 'react';
import { useIsChangedByOthers, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { inactiveLabel, initiativeRows, NONE } from '../data/initiativeList';
import { costedRows, isDefaultPortfolioFilters, PORTFOLIO_DEFAULTS, portfolioRows, liveYear, portfolioYears, type PortfolioFilters, type PortfolioRow } from '../data/portfolio';
import { FILE_PATHS, INITIATIVE_STATUSES, type InitiativeStatus } from '../data/types';
import { useNeedsAttentionItems } from '../state/NeedsAttentionContext';
import { lastCostedPassedGate } from '../data/gate';
import { recordedActuals } from '../data/keyFigures';
import { ApprovalTrackBadge } from './ApprovalTrackBadge';
import { BulletBar } from './BulletBar';
import { AttentionMarker, IconMarker } from './AttentionMarker';
import { CompactAmount } from './CompactAmount';
import { CopyButton } from './CopyButton';
import type { CopyTableData } from './copyTable';
import { byLabel, FilterChip, type FilterOption } from './FilterChip';
import { formatAmount, formatSignedAmount } from './formatAmount';
import { STATUS_GLYPH, statusText } from './StatusLabel';
import { TruncatedText } from './TruncatedText';
import { NoInitiatives } from './NoInitiatives';
import { GettingStartedStrip } from './GettingStartedStrip';
import { NeedsAttentionStrip } from './NeedsAttentionStrip';
import { useSessionFilters } from './sessionFilters';
import { YearChip } from './YearChip';

/** A non-Active status on a card (§5.2): a neutral icon named by the status, the same pattern as the attention marker. */
function StatusMarker({ status }: { status: InitiativeStatus }) {
  if (status === 'Active') return null;
  const Icon = STATUS_GLYPH[status];
  return (
    <IconMarker label={statusText(status)} tooltip={statusText(status)} className="text-text-secondary">
      <Icon width={16} height={16} />
    </IconMarker>
  );
}

/**
 * One initiative's card (§5.2): name, status and attention markers, team · owner, compact cost with its miniature
 * bullet bar, and approval track; the whole card is the link, lifting slightly on hover (slice 059). The bar always
 * shows the lifetime grand estimate, like the badge, even when the figure beside it is one year's cost.
 */
function BoardCard({ row }: { row: PortfolioRow }) {
  const attention = useNeedsAttentionItems();
  const changed = useIsChangedByOthers();
  const { process } = useBrand();
  const { initiative } = row;
  const item = attention.find((i) => i.initiativeId === initiative.id);
  return (
    <a
      className={`block rounded-card shadow-card px-3 py-2.5 text-inherit no-underline transition-[background-color,translate,box-shadow] duration-500 hover:-translate-y-px hover:shadow-md hover:duration-[120ms] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${changed(FILE_PATHS.initiative(initiative.id), []) ? 'bg-met-tint' : 'bg-surface-card'}`}
      href={`#/initiatives/${initiative.id}`}
    >
      <div className="flex items-center justify-between gap-1.5 text-body font-medium">
        <TruncatedText text={initiative.name} className="min-w-0" />
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusMarker status={initiative.status} />
          {item && <AttentionMarker item={item} />}
        </span>
      </div>
      <div className="mb-1.5 mt-0.5 truncate text-caption text-text-secondary">
        {row.teamName} · {initiative.ownerId ? row.ownerName : 'No owner'}
      </div>
      <div className="flex items-center gap-2 text-caption">
        <CompactAmount value={row.cost} className="min-w-11" />
        <div className="min-w-0 flex-1 pr-1.5">
          <BulletBar
            size="card"
            estimate={row.total}
            approved={lastCostedPassedGate(process, initiative)?.record.recordedGrandEstimate}
            actuals={recordedActuals(initiative, process).total}
            escalated={item?.kind === 'escalated'}
          />
        </div>
        <ApprovalTrackBadge initiative={initiative} />
      </div>
    </a>
  );
}

/**
 * Portfolio overview (§5.2): the Getting started and Needs attention strips, the filters, the key metrics, the
 * board and Copy.
 */
export function PortfolioBoard() {
  const brand = useBrand();
  const { process, approvalTracks, currencySymbol } = brand;
  const { teams, people, roles, countries, initiatives } = useRepositoryState();
  const [stored, setFilters] = useSessionFilters<PortfolioFilters>('portfolio', PORTFOLIO_DEFAULTS);
  const data = useMemo(() => ({ roles, countries }), [roles, countries]);

  const rows = useMemo(
    // The board's cards look up their own attention item; the rows don't need it.
    () => costedRows(initiativeRows(initiatives, teams, people, process, approvalTracks, data, []), process, people, data),
    [initiatives, teams, people, process, approvalTracks, data],
  );
  const years = useMemo(() => portfolioYears(rows), [rows]);

  const options = useMemo<Record<'team' | 'phase' | 'initiative' | 'track' | 'status', FilterOption[]>>(
    () => ({
      team: byLabel(teams.map((t) => ({ value: t.id, label: inactiveLabel(t.name, t.active) }))),
      phase: process.map((p) => ({ value: p.id, label: p.label })),
      initiative: byLabel(initiatives.map((i) => ({ value: i.id, label: i.name }))),
      track: [...approvalTracks.map((t) => ({ value: t.id, label: t.name })), { value: NONE, label: 'No approval track' }],
      status: INITIATIVE_STATUSES.map((s) => ({ value: s, label: statusText(s) })),
    }),
    [teams, process, initiatives, approvalTracks],
  );

  /** The session's picks, less any that no longer exist (an initiative deleted since) — they couldn't be unticked. */
  const filters = useMemo<PortfolioFilters>(() => {
    const live = (key: keyof typeof options) => stored[key].filter((v) => options[key].some((o) => o.value === v));
    return { ...stored, team: live('team'), phase: live('phase'), initiative: live('initiative'), track: live('track'), status: live('status'), year: liveYear(stored.year, years) };
  }, [stored, options, years]);
  const shown = useMemo(() => portfolioRows(rows, filters), [rows, filters]);
  /** Board order: phase by phase, cards in list order — what Copy follows too. */
  const byPhase = useMemo(() => {
    const map = new Map<string, PortfolioRow[]>(process.map((phase) => [phase.id, []]));
    for (const row of shown) map.get(row.phaseId)?.push(row);
    return map;
  }, [process, shown]);

  if (initiatives.length === 0) {
    return (
      <>
        <h1 className="sr-only">Portfolio</h1>
        <div className="px-8 pt-6 empty:hidden [&>section]:mb-0">
          <GettingStartedStrip />
        </div>
        <NoInitiatives />
      </>
    );
  }

  const totalCost = shown.reduce((sum, r) => sum + r.cost, 0);
  const deviation = shown.reduce((sum, r) => sum + r.deviation, 0);
  const clearable = !isDefaultPortfolioFilters(filters);
  const clear = () => setFilters(PORTFOLIO_DEFAULTS);
  const chip = (key: keyof typeof options, label: string) => (
    <FilterChip selectedFirst={key === 'team' || key === 'initiative'} label={label} options={options[key]} selected={filters[key]} onChange={(next) => setFilters({ ...filters, [key]: next })} />
  );

  function copyData(): CopyTableData {
    const ordered = process.flatMap((phase) => byPhase.get(phase.id) ?? []);
    return {
      headers: ['Name', 'Team', 'Owner', 'Phase', filters.year === null ? 'Grand estimate' : `Cost in ${filters.year}`, 'Approval track', 'Status'],
      rows: ordered.map((r) => [r.initiative.name, r.teamName, r.ownerName, r.phaseLabel, formatAmount(r.cost, currencySymbol), r.trackName, statusText(r.initiative.status)]),
      footerRows: [
        ['Total cost', '', '', '', formatAmount(totalCost, currencySymbol), '', ''],
        ['Deviation', '', '', '', formatSignedAmount(deviation, currencySymbol), '', ''],
      ],
      numericColumns: [4],
    };
  }

  return (
    <div className="px-8 py-6">
      <h1 className="sr-only">Portfolio</h1>
      <GettingStartedStrip />
      <NeedsAttentionStrip />
      <div className="mb-3 flex flex-wrap gap-2">
        {chip('team', 'Team')}
        {chip('phase', 'Phase')}
        <YearChip years={years} selected={filters.year} onChange={(year) => setFilters({ ...filters, year })} />
        {chip('initiative', 'Initiatives')}
        {chip('track', 'Approval track')}
        {chip('status', 'Status')}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-body">
        <p className="m-0">
          Total cost <CompactAmount value={totalCost} className="font-medium" />
          <span className="mx-2 text-text-secondary">·</span>
          Deviation <CompactAmount value={deviation} signed className={`font-medium ${deviation > 0 ? 'text-warning-text' : ''}`} />
        </p>
        <div className="flex items-center gap-3">
          <p className="m-0 text-text-secondary">
            {shown.length} of {initiatives.length} {initiatives.length === 1 ? 'initiative' : 'initiatives'}
          </p>
          {clearable && (
            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-brand-accent-text underline" onClick={clear}>
              Clear filters
            </button>
          )}
          {shown.length > 0 && <CopyButton getData={copyData} noun={['initiative', 'initiatives']} />}
        </div>
      </div>
      {shown.length === 0 && (
        <p className="m-0 mb-3 rounded-lg border border-dashed border-border-strong bg-surface-card p-3.5 text-center text-body text-text-secondary">
          No initiatives match these filters.
          <button type="button" className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-body text-brand-accent-text underline" onClick={clear}>
            Clear filters
          </button>
        </p>
      )}
      <div className="flex items-start gap-4 overflow-x-auto">
        {process.map((phase) => {
          const phaseRows = byPhase.get(phase.id) ?? [];
          const columnSum = phaseRows.reduce((sum, r) => sum + r.cost, 0);
          return (
            <div key={phase.id} className="min-w-55 flex-[1_0_220px] py-1">
              <div className="mb-2.5 flex items-center justify-between px-0.5 text-body font-medium">
                <span>{phase.label}</span>
                <CompactAmount value={columnSum} prefix={`${phaseRows.length} · `} className="font-medium text-text-secondary" />
              </div>
              <div className="flex flex-col gap-2">
                {phaseRows.map((row) => (
                  <BoardCard key={row.initiative.id} row={row} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
