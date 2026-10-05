import { useMemo } from 'react';
import { useIsChangedByOthers, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { inactiveLabel, initiativeRows, NONE } from '../data/initiativeList';
import { costedRows, isDefaultPortfolioFilters, PORTFOLIO_DEFAULTS, portfolioRows, liveYear, portfolioYears, type PortfolioFilters, type PortfolioRow } from '../data/portfolio';
import { FILE_PATHS, INITIATIVE_STATUSES, type InitiativeStatus } from '../data/types';
import { useNeedsAttentionItems } from '../state/NeedsAttentionContext';
import { ApprovalTrackBadge } from './ApprovalTrackBadge';
import { BulletBar } from './BulletBar';
import { AttentionMarker, IconMarker } from './AttentionMarker';
import { ChangedDot, ChangedMarker } from './ChangedMarker';
import { useChangedInitiatives, useSeen, useSeenActions } from '../state/SeenContext';
import { formatSince } from '../data/seen';
import { CompactAmount } from './CompactAmount';
import { Button } from '@/components/ui/button';
import { CopyButton } from './CopyButton';
import { PhaseIcon } from './icons';
import { ClearFilters, Page, Toolbar } from './Page';
import { plural } from '../data/plural';
import type { CopyTableData } from './copyTable';
import { byLabel, FilterChip, type FilterOption } from './FilterChip';
import { formatAmount, formatSignedAmount } from './formatAmount';
import { STATUS_GLYPH, statusText } from './StatusLabel';
import { TruncatedText } from './TruncatedText';
import { NoInitiatives } from './NoInitiatives';
import { GettingStartedChip, GettingStartedStrip } from './GettingStartedStrip';
import { WelcomeCard } from './WelcomeCard';
import { showsWelcome } from '../data/gettingStarted';
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
  const seen = useSeen();
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
          {seen.changed.has(initiative.id) && <ChangedMarker />}
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
          <BulletBar size="card" estimate={row.total} approved={row.approved} actuals={row.actuals} escalated={row.escalated} />
        </div>
        <ApprovalTrackBadge initiative={initiative} />
      </div>
    </a>
  );
}

/** "N initiatives changed since you last looked, <day date>" with Mark as seen (§9.9): every changed initiative, whatever the filters. */
function ChangedLine() {
  const { markAllSeen } = useSeenActions();
  const changed = useChangedInitiatives();
  if (changed.length === 0) return null;
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-card bg-surface-card px-3.5 py-2 text-body shadow-card">
      <p className="m-0 flex items-center gap-2">
        <ChangedDot />
        {plural(changed.length, 'initiative', 'initiatives')} changed since you last looked, {formatSince(changed[0].since, new Date())}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={markAllSeen}>
        Mark as seen
      </Button>
    </div>
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
    () => costedRows(initiativeRows(initiatives, teams, people, process, approvalTracks, data, []), process, people, data, approvalTracks),
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
      <Page title="Portfolio">
        {showsWelcome({ teams, initiatives }) ? (
          <WelcomeCard />
        ) : (
          <>
            {/* No toolbar row without initiatives, so the strip stays expanded at three of four (§5.2). */}
            <div className="empty:hidden [&>section]:mb-0">
              <GettingStartedStrip />
            </div>
            <NoInitiatives />
          </>
        )}
      </Page>
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
    <Page title="Portfolio">
      <GettingStartedStrip collapsible />
      <NeedsAttentionStrip />
      <ChangedLine />
      <Toolbar
        className="mb-2"
        filters={
          <>
            <GettingStartedChip />
            {chip('team', 'Team')}
            {chip('phase', 'Phase')}
            <YearChip years={years} selected={filters.year} onChange={(year) => setFilters({ ...filters, year })} />
            {chip('initiative', 'Initiatives')}
            {chip('track', 'Approval track')}
            {chip('status', 'Status')}
          </>
        }
      >
        <p className="m-0">
          {shown.length} of {plural(initiatives.length, 'initiative', 'initiatives')}
        </p>
        {clearable && (
          <ClearFilters onClick={clear} />
        )}
        {shown.length > 0 && <CopyButton getData={copyData} noun={['initiative', 'initiatives']} />}
      </Toolbar>
      <p className="m-0 mb-3 text-body">
        Total cost <CompactAmount value={totalCost} className="font-medium" />
        <span className="mx-2 text-text-secondary">·</span>
        Deviation <CompactAmount value={deviation} signed className={`font-medium ${deviation > 0 ? 'text-warning-text' : ''}`} />
      </p>
      {shown.length === 0 && (
        <p className="m-0 mb-3 rounded-lg border border-dashed border-border-strong bg-surface-card p-3.5 text-center text-body text-text-secondary">
          No initiatives match these filters.
          <span className="ml-2"><ClearFilters onClick={clear} /></span>
        </p>
      )}
      <div className="flex items-start gap-4 overflow-x-auto">
        {process.map((phase) => {
          const phaseRows = byPhase.get(phase.id) ?? [];
          const columnSum = phaseRows.reduce((sum, r) => sum + r.cost, 0);
          return (
            <div key={phase.id} role="group" aria-label={phase.label} className="min-w-55 flex-[1_0_220px] py-1">
              {/* The phase's icon beside its label, the count as a pill and the sum (§5.2, §9.10). */}
              <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5 text-body font-medium">
                <span className="flex min-w-0 items-center gap-1.5">
                  <PhaseIcon name={phase.icon} width={16} height={16} className="shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="truncate">{phase.label}</span>
                  <span className="rounded-full border border-border-default bg-surface-subtle px-1.5 text-label font-medium text-text-secondary">
                    {phaseRows.length}
                    <span className="sr-only"> {phaseRows.length === 1 ? 'initiative' : 'initiatives'}</span>
                  </span>
                </span>
                <CompactAmount value={columnSum} className="font-medium text-text-secondary" />
              </div>
              <div className="flex flex-col gap-2">
                {phaseRows.length === 0 ? (
                  <p className="m-0 rounded-card border border-dashed border-border-strong p-3.5 text-center text-caption text-text-secondary">No initiatives in {phase.label}</p>
                ) : (
                  phaseRows.map((row) => <BoardCard key={row.initiative.id} row={row} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
