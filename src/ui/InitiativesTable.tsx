import { useMemo } from 'react';
import { activeFilterCount, attentionRank, filterRows, initiativeRows, NO_FILTERS, NONE, type InitiativeFilters } from '../data/initiativeList';
import { sortRows } from '../data/sortRows';
import { FILE_PATHS } from '../data/types';
import { useNeedsAttentionItems } from '../state/NeedsAttentionContext';
import { useBrand } from '../state/BrandContext';
import { useIsChangedByOthers, useRepositoryState } from '../state/DataContext';
import { navigate } from '../router/useHashRoute';
import { ApprovalTrackBadge } from './ApprovalTrackBadge';
import { CopyButton } from './CopyButton';
import { EmptyState } from './EmptyState';
import { FilterChip, type FilterOption } from './FilterChip';
import { formatAmount } from './formatAmount';
import { KIND_CONFIG } from './NeedsAttentionStrip';
import { NoInitiatives } from './NoInitiatives';
import { SortableHeader } from './SortableHeader';
import { TruncatedText } from './TruncatedText';
import { useTableSort } from './tableSort';
import { useSessionFilters } from './sessionFilters';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const STATUSES = ['Active', 'On Hold', 'Cancelled', 'Closed'];

const inactive = (name: string, active: boolean) => (active ? name : `${name} (inactive)`);

/** The Initiatives overview (§5.3): every initiative in every status, filterable, sortable and copyable. */
export function InitiativesTable() {
  const { process, approvalTracks, currencySymbol } = useBrand();
  const { initiatives, teams, people, roles, countries } = useRepositoryState();
  const attention = useNeedsAttentionItems();
  const changed = useIsChangedByOthers();
  const [filters, setFilters] = useSessionFilters('initiatives');
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

  if (initiatives.length === 0) return <NoInitiatives />;

  const options: Record<keyof InitiativeFilters, FilterOption[]> = {
    team: teams.map((t) => ({ value: t.id, label: inactive(t.name, t.active) })),
    owner: [{ value: NONE, label: 'No owner' }, ...people.map((p) => ({ value: p.id, label: inactive(p.name, p.active) }))],
    phase: process.map((p) => ({ value: p.id, label: p.label })),
    track: [...approvalTracks.map((t) => ({ value: t.id, label: t.name })), { value: NONE, label: 'No approval track' }],
    status: STATUSES.map((s) => ({ value: s, label: s })),
  };
  const chips: [keyof InitiativeFilters, string][] = [
    ['team', 'Team'],
    ['owner', 'Owner'],
    ['phase', 'Phase'],
    ['track', 'Approval track'],
    ['status', 'Status'],
  ];
  const filtering = activeFilterCount(filters) > 0;
  const noun = (n: number) => `${n} ${n === 1 ? 'initiative' : 'initiatives'}`;

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
        r.initiative.status,
        r.attention ? KIND_CONFIG[r.attention.kind].label : '',
      ]),
      numericColumns: [4],
    };
  }

  return (
    <div className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="m-0 text-xl">Initiatives</h1>
        {visible.length > 0 && <CopyButton getData={copyData} noun={['initiative', 'initiatives']} />}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {chips.map(([key, label]) => (
            <FilterChip key={key} label={label} options={options[key]} selected={filters[key]} onChange={(next) => setFilters({ ...filters, [key]: next })} />
          ))}
        </div>
        <p className="m-0 text-sm text-text-secondary">
          {filtering ? `${visible.length} of ${noun(rows.length)}` : noun(rows.length)}
          {filtering && (
            <button type="button" className="ml-3 cursor-pointer border-0 bg-transparent p-0 text-brand-accent-text underline" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </button>
          )}
        </p>
      </div>
      {visible.length === 0 ? (
        <EmptyState line="No initiatives match these filters." actionLabel="Clear filters" onAction={() => setFilters(NO_FILTERS)} />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-text-secondary">
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
              const config = item && KIND_CONFIG[item.kind];
              return (
                <tr
                  key={r.initiative.id}
                  className={`cursor-pointer border-b border-border-default transition-colors duration-500 ${changed(FILE_PATHS.initiative(r.initiative.id), []) ? 'bg-met-tint' : ''}`}
                  onClick={() => navigate(`/initiatives/${r.initiative.id}`)}
                >
                  <td className="px-3 py-2">
                    <a href={href} className="font-medium text-inherit no-underline hover:underline" onClick={(e) => e.stopPropagation()}>
                      <TruncatedText text={r.initiative.name} />
                    </a>
                  </td>
                  <td className="px-3 py-2">{r.teamName}</td>
                  <td className="px-3 py-2">{r.ownerName}</td>
                  <td className="px-3 py-2">{r.phaseLabel}</td>
                  <td className="px-3 py-2 text-right">{formatAmount(r.total, currencySymbol)}</td>
                  <td className="px-3 py-2">
                    <ApprovalTrackBadge initiative={r.initiative} />
                  </td>
                  <td className="px-3 py-2">{r.initiative.status}</td>
                  <td className="px-3 py-2">
                    {item && config && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span role="img" aria-label={config.label} tabIndex={0} className={`inline-flex ${config.colorClass}`}>
                            <config.Icon width={16} height={16} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{`${config.label}: ${item.reason}`}</TooltipContent>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
