import { useMemo } from 'react';
import { activeFilterCount, attentionRank, filterRows, inactiveLabel, initiativeRows, NO_FILTERS, NONE, type InitiativeFilters } from '../data/initiativeList';
import { sortRows } from '../data/sortRows';
import { FILE_PATHS, INITIATIVE_STATUSES } from '../data/types';
import { useNeedsAttentionItems } from '../state/NeedsAttentionContext';
import { useBrand } from '../state/BrandContext';
import { useIsChangedByOthers, useRepositoryState } from '../state/DataContext';
import { openRowProps } from './openRowProps';
import { navigate } from '../router/useHashRoute';
import { ApprovalTrackBadge } from './ApprovalTrackBadge';
import { CopyButton } from './CopyButton';
import { EmptyState } from './EmptyState';
import { byLabel, FilterChip, type FilterOption } from './FilterChip';
import { formatAmount } from './formatAmount';
import { AttentionMarker } from './AttentionMarker';
import { ChangedMarker } from './ChangedMarker';
import { useSeen } from '../state/SeenContext';
import { KIND_CONFIG } from './NeedsAttentionStrip';
import { NoInitiatives } from './NoInitiatives';
import { SortableHeader } from './SortableHeader';
import { TruncatedText } from './TruncatedText';
import { useTableSort } from './tableSort';
import { useSessionFilters } from './sessionFilters';
import { ClearFilters, Page, Toolbar } from './Page';
import { plural } from '../data/plural';
import { StatusLabel, statusText } from './StatusLabel';

const CHIPS: [keyof InitiativeFilters, string][] = [
  ['team', 'Team'],
  ['owner', 'Owner'],
  ['phase', 'Phase'],
  ['track', 'Approval track'],
  ['status', 'Status'],
];

/** The Initiatives overview (§5.3): every initiative in every status, filterable, sortable and copyable. */
export function InitiativesTable() {
  const { process, approvalTracks, currencySymbol } = useBrand();
  const { initiatives, teams, people, roles, countries } = useRepositoryState();
  const attention = useNeedsAttentionItems();
  const changed = useIsChangedByOthers();
  const seen = useSeen();
  const [filters, setFilters] = useSessionFilters('initiatives', NO_FILTERS);
  const sort = useTableSort('attention');

  const rows = useMemo(
    () => initiativeRows(initiatives, teams, people, process, approvalTracks, { roles, countries }, attention),
    [initiatives, teams, people, process, approvalTracks, roles, countries, attention],
  );
  const visible = useMemo(
    () =>
      sortRows(
        filterRows(rows, filters),
        {
          name: (r) => r.initiative.name,
          team: (r) => r.teamName,
          owner: (r) => (r.initiative.ownerId ? r.ownerName : '￿'),
          phase: (r) => process.findIndex((p) => p.id === r.phaseId),
          estimate: (r) => r.total,
          track: (r) => r.trackSeverity,
          status: (r) => r.initiative.status,
          attention: attentionRank,
        },
        sort.key,
        sort.dir,
        'name',
      ),
    [rows, filters, sort.key, sort.dir, process],
  );

  const options = useMemo<Record<keyof InitiativeFilters, FilterOption[]>>(
    () => ({
    team: byLabel(teams.map((t) => ({ value: t.id, label: inactiveLabel(t.name, t.active) }))),
    owner: [{ value: NONE, label: 'No owner' }, ...byLabel(people.map((p) => ({ value: p.id, label: inactiveLabel(p.name, p.active) })))],
    phase: process.map((p) => ({ value: p.id, label: p.label })),
    track: [...approvalTracks.map((t) => ({ value: t.id, label: t.name })), { value: NONE, label: 'No approval track' }],
    status: INITIATIVE_STATUSES.map((s) => ({ value: s, label: statusText(s) })),
    }),
    [teams, people, process, approvalTracks],
  );

  if (initiatives.length === 0)
    return (
      <Page title="Initiatives">
        <NoInitiatives />
      </Page>
    );

  const filtering = activeFilterCount(filters) > 0;
  const noun = (n: number) => plural(n, 'initiative', 'initiatives');

  function copyData() {
    return {
      headers: ['Name', 'Team', 'Owner', 'Phase', 'Grand estimate', 'Approval track', 'Status', 'Needs attention'],
      rows: visible.map((r) => [
        r.initiative.name,
        r.teamName,
        r.ownerName,
        r.phaseLabel,
        formatAmount(r.total, currencySymbol),
        r.trackName,
        statusText(r.initiative.status),
        r.attention ? KIND_CONFIG[r.attention.kind].label : '',
      ]),
      numericColumns: [4],
    };
  }

  return (
    <Page title="Initiatives">
      <Toolbar
        filters={CHIPS.map(([key, label]) => (
          <FilterChip key={key} selectedFirst={key === 'team' || key === 'owner'} label={label} options={options[key]} selected={filters[key]} onChange={(next) => setFilters({ ...filters, [key]: next })} />
        ))}
      >
        <p className="m-0">{filtering ? `${visible.length} of ${noun(rows.length)}` : noun(rows.length)}</p>
        {filtering && (
          <ClearFilters onClick={() => setFilters(NO_FILTERS)} />
        )}
        {visible.length > 0 && <CopyButton getData={copyData} noun={['initiative', 'initiatives']} />}
      </Toolbar>
      {visible.length === 0 ? (
        <EmptyState line="No initiatives match these filters." actionLabel="Clear filters" onAction={() => setFilters(NO_FILTERS)} />
      ) : (
        <table className="tabular-nums w-full border-collapse text-body">
          <thead>
            <tr className="text-label text-left text-text-secondary">
              <SortableHeader label="Name" sortKey="name" sort={sort} />
              <SortableHeader label="Team" sortKey="team" sort={sort} />
              <SortableHeader label="Owner" sortKey="owner" sort={sort} />
              <SortableHeader label="Phase" sortKey="phase" sort={sort} />
              <SortableHeader label="Grand estimate" sortKey="estimate" sort={sort} align="right" />
              <SortableHeader label="Approval track" sortKey="track" sort={sort} />
              <SortableHeader label="Status" sortKey="status" sort={sort} />
              <SortableHeader label="Needs attention" sortKey="attention" sort={sort} />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const href = `#/initiatives/${r.initiative.id}`;
              const item = r.attention;
              return (
                <tr
                  key={r.initiative.id}
                  className={`cursor-pointer border-b border-border-default transition-colors duration-500 motion-reduce:transition-none ${changed(FILE_PATHS.initiative(r.initiative.id), []) ? 'bg-met-tint' : ''}`}
                  {...openRowProps(() => navigate(`/initiatives/${r.initiative.id}`))}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {seen.changed.size > 0 && <span className="flex size-4 shrink-0 items-center justify-center">{seen.changed.has(r.initiative.id) && <ChangedMarker />}</span>}
                      <a href={href} className="min-w-0 font-medium text-inherit no-underline hover:underline">
                        <TruncatedText text={r.initiative.name} />
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.teamName}</td>
                  <td className="px-3 py-2">{r.ownerName}</td>
                  <td className="px-3 py-2">{r.phaseLabel}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(r.total, currencySymbol)}</td>
                  <td className="px-3 py-2">
                    <ApprovalTrackBadge initiative={r.initiative} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusLabel status={r.initiative.status} />
                  </td>
                  <td className="px-3 py-2">
                    {item && <AttentionMarker item={item} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Page>
  );
}
