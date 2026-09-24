import { useMemo, useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { useRepositoryState } from '../state/DataContext';
import { loadsIn, teamCapacity, type CapacityCell, type CapacityRow, type Load, type TeamCapacity } from '../data/capacity';
import { formatMonth, formatMonthRanges, formatMonthShort, formatPeriod, localToday } from '../data/dates';
import type { Team } from '../data/types';
import { CopyButton } from './CopyButton';
import { InlineWarning } from './InlineWarning';
import { OverCapacityIcon, OverTeamFteIcon, WarningIcon } from './icons';
import { Button } from '@/components/ui/button';

/** Allocation % are unrounded, so a figure shows at most one decimal. */
const pct = (value: number) => `${Math.round(value * 10) / 10}%`;

/** What a cell says in words: the number, then each ceiling it is over, then any Provisional figure. Used for its label and for Copy. */
function cellWords(cell: CapacityCell): { main: string; markers: string[]; provisional: string | null } {
  return {
    main: cell.teamPct > 0 ? pct(cell.teamPct) : '–',
    markers: [...(cell.overTeamFte ? ['over Team FTE %'] : []), ...(cell.overCapacity ? ['over Capacity %'] : [])],
    provisional: cell.provisionalPct > 0 ? `+${pct(cell.provisionalPct)} provisional` : null,
  };
}

interface Warning {
  Icon: typeof WarningIcon;
  text: string;
}

/** The §7.2 warnings on a person beyond the two ceilings: Team FTE %s over Capacity %, and allocations that outlived the membership. */
function otherWarnings(row: CapacityRow, team: Team): Warning[] {
  const { person } = row;
  const warnings: Warning[] = [];
  if (row.fteSumOverCapacity) {
    warnings.push({ Icon: WarningIcon, text: `${person.name}'s Team FTE %s add up to ${pct(row.fteSumOverCapacity.claimedPct)}, more than their ${pct(row.fteSumOverCapacity.capacityPct)} Capacity %.` });
  }
  if (row.stranded.length > 0) {
    const where = [...new Set(row.stranded.map((l) => `${l.initiativeName} (${l.phaseLabel})`))].join(', ');
    warnings.push({ Icon: WarningIcon, text: `${person.name} is no longer a member of ${team.name}, but is still allocated to ${where}. These allocations stay and keep costing.` });
  }
  return warnings;
}

interface Selection {
  personId: string;
  /** A month, or null for the whole row. */
  month: string | null;
}

/** The team detail's Capacity view (§5.8, §7.2): a month-by-month grid of each member's allocation against their two ceilings. */
export function CapacityGrid({ team }: { team: Team }) {
  const { process } = useBrand();
  const { initiatives, people, memberships } = useRepositoryState();
  const [selection, setSelection] = useState<Selection | null>(null);
  const today = localToday();
  const capacity = useMemo(() => teamCapacity(team.id, { initiatives, people, memberships, process, today }), [team.id, initiatives, people, memberships, process, today]);

  function copyData() {
    return {
      headers: ['Name', 'Team FTE %', ...capacity.months.map(formatMonthShort)],
      rows: capacity.rows.map((r) => [
        r.person.name,
        r.teamFtePct === null ? 'No longer a member' : pct(r.teamFtePct),
        ...r.cells.map((c) => {
          const { main, markers, provisional } = cellWords(c);
          return [main, markers.length > 0 ? `(${markers.join(', ')})` : null, provisional].filter(Boolean).join(' ');
        }),
      ]),
    };
  }

  // A selection whose person or month has since left the grid (an allocation was edited or removed) shows nothing.
  const selectedRow = selection && capacity.rows.find((r) => r.person.id === selection.personId && (selection.month === null || r.cells.some((c) => c.month === selection.month)));
  const toggle = (next: Selection) => setSelection((cur) => (cur && cur.personId === next.personId && cur.month === next.month ? null : next));

  return (
    <section aria-label="Capacity" className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-base">Capacity</h2>
        {capacity.months.length > 0 && <CopyButton getData={copyData} noun={['person', 'people']} label="Copy capacity" />}
      </div>

      {capacity.rows.length === 0 ? (
        <p className="m-0 py-6 text-[15px] text-text-secondary">No members yet. Add members to see their capacity.</p>
      ) : capacity.months.length === 0 ? (
        <>
          <p className="m-0 py-6 text-[15px] text-text-secondary">Nothing allocated yet. Allocate members to an initiative&apos;s phase and their months appear here.</p>
          <div className="flex flex-col items-start gap-1">
            {capacity.rows.flatMap((row) => otherWarnings(row, team)).map(({ Icon, text }) => (
              <InlineWarning key={text} icon={Icon}>
                {text}
              </InlineWarning>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border-default bg-surface-card">
            <table className="w-max min-w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th scope="col" className="sticky left-0 z-10 min-w-44 border-b border-border-default bg-surface-card px-3 py-2 font-medium">
                    Name
                  </th>
                  {capacity.months.map((month) => (
                    <th key={month} scope="col" className="border-b border-border-default px-3 py-2 text-center font-medium whitespace-nowrap">
                      {formatMonthShort(month)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {capacity.rows.map((row) => (
                  <tr key={row.person.id} className="border-b border-border-default last:border-b-0">
                    <th scope="row" className="sticky left-0 z-10 bg-surface-card px-3 py-1.5 text-left font-normal">
                      <button
                        type="button"
                        aria-label={`All months for ${row.person.name}`}
                        aria-pressed={selection?.personId === row.person.id && selection.month === null}
                        className="cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left font-medium text-inherit"
                        onClick={() => toggle({ personId: row.person.id, month: null })}
                      >
                        {row.person.name}
                      </button>
                      <div className="text-xs text-text-secondary">{row.teamFtePct === null ? 'No longer a member' : `Team FTE ${pct(row.teamFtePct)}`}</div>
                    </th>
                    {row.cells.map((cell) => (
                      <td key={cell.month} className="p-0">
                        <CellButton
                          name={row.person.name}
                          cell={cell}
                          selected={selection?.personId === row.person.id && selection.month === cell.month}
                          onSelect={() => toggle({ personId: row.person.id, month: cell.month })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1">
              <OverTeamFteIcon width={14} height={14} className="text-warning-text" /> Over Team FTE %
            </span>
            <span className="inline-flex items-center gap-1">
              <OverCapacityIcon width={14} height={14} className="text-warning-text" /> Over Capacity %
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="text-text-muted">
                +20%
              </span>
              Provisional, not counted
            </span>
          </p>
        </>
      )}

      {selection && selectedRow && <Detail row={selectedRow} month={selection.month} team={team} capacity={capacity} onClose={() => setSelection(null)} />}
    </section>
  );
}

function CellButton({ name, cell, selected, onSelect }: { name: string; cell: CapacityCell; selected: boolean; onSelect: () => void }) {
  const { main, markers, provisional } = cellWords(cell);
  const warned = cell.overTeamFte || cell.overCapacity;
  const label = [`${name}, ${formatMonth(cell.month)}: ${cell.teamPct > 0 ? pct(cell.teamPct) : '0%'}`, ...markers, ...(provisional ? [provisional] : [])].join(', ');
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex h-10 w-full min-w-20 cursor-pointer items-center justify-center gap-1 border-0 px-2 tabular-nums -outline-offset-2 ${
        warned ? 'bg-warning-tint text-warning-text' : 'bg-transparent text-text-primary'
      } ${selected ? 'ring-2 ring-brand-accent ring-inset' : ''}`}
    >
      <span className={cell.teamPct > 0 ? 'font-medium' : 'text-text-muted'}>{main}</span>
      {cell.overTeamFte && <OverTeamFteIcon width={14} height={14} data-testid="over-team-fte" />}
      {cell.overCapacity && <OverCapacityIcon width={14} height={14} data-testid="over-capacity" />}
      {cell.provisionalPct > 0 && (
        <span className="text-xs font-normal text-text-muted" title="Provisional, not counted">
          +{pct(cell.provisionalPct)}
        </span>
      )}
    </button>
  );
}

function Detail({ row, month, team, capacity, onClose }: { row: CapacityRow; month: string | null; team: Team; capacity: TeamCapacity; onClose: () => void }) {
  const { teams } = useRepositoryState();
  const { person } = row;
  const cell = month ? row.cells.find((c) => c.month === month) : undefined;

  const warnings: Warning[] = [];
  if (month && cell) {
    if (cell.overTeamFte) warnings.push({ Icon: OverTeamFteIcon, text: `Over Team FTE %: ${pct(cell.teamPct)} on ${team.name} initiatives, Team FTE % is ${pct(row.teamFtePct ?? 0)}.` });
    if (cell.overCapacity) warnings.push({ Icon: OverCapacityIcon, text: `Over Capacity %: ${pct(cell.totalPct)} across all teams, Capacity % is ${pct(person.capacityPct)}.` });
  } else {
    const overFte = row.cells.filter((c) => c.overTeamFte).map((c) => c.month);
    const overCap = row.cells.filter((c) => c.overCapacity).map((c) => c.month);
    if (overFte.length > 0) warnings.push({ Icon: OverTeamFteIcon, text: `Over Team FTE % in ${formatMonthRanges(overFte)}.` });
    if (overCap.length > 0) warnings.push({ Icon: OverCapacityIcon, text: `Over Capacity % in ${formatMonthRanges(overCap)}.` });
  }
  warnings.push(...otherWarnings(row, team));

  const loads = month ? loadsIn(capacity.loads, person.id, month) : capacity.loads.filter((l) => l.personId === person.id && l.months.some((m) => capacity.months.includes(m)));
  const counted = loads.filter((l) => l.confirmed);
  const provisional = loads.filter((l) => !l.confirmed);
  const teamName = (l: Load) => (l.teamId === team.id ? null : teams.find((t) => t.id === l.teamId)?.name ?? 'another team');

  return (
    <section aria-label="Capacity detail" className="mt-4 rounded-lg border border-border-default bg-surface-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 text-base font-medium">
          {person.name} · {month ? formatMonth(month) : 'all months'}
        </h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close details
        </Button>
      </div>

      {warnings.length === 0 ? (
        <p className="m-0 mb-3 text-sm text-text-secondary">{month ? 'No warnings this month.' : 'No warnings in these months.'}</p>
      ) : (
        <ul className="m-0 mb-3 flex list-none flex-col gap-1 p-0 text-sm text-warning-text">
          {warnings.map(({ Icon, text }) => (
            <li key={text} className="flex items-start gap-1.5">
              <Icon width={16} height={16} className="mt-0.5 shrink-0" />
              {text}
            </li>
          ))}
        </ul>
      )}

      <LoadList heading="Counted" loads={counted} showPeriod={!month} teamName={teamName} />
      <LoadList heading="Not counted (Provisional)" loads={provisional} showPeriod={!month} teamName={teamName} />
    </section>
  );
}

function LoadList({ heading, loads, showPeriod, teamName }: { heading: string; loads: Load[]; showPeriod: boolean; teamName: (l: Load) => string | null }) {
  if (loads.length === 0) return null;
  return (
    <div className="mb-2">
      <h4 className="m-0 mb-1 text-xs font-medium text-text-secondary">{heading}</h4>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">
        {loads.map((l, i) => (
          <li key={`${l.initiativeId}-${l.phaseId}-${i}`}>
            <a href={`#/initiatives/${l.initiativeId}`}>{l.initiativeName}</a>{' '}
            <span className="text-text-secondary">
              {l.phaseLabel}
              {showPeriod && ` · ${formatPeriod(l.startDate, l.endDate)}`}
              {teamName(l) && ` · ${teamName(l)} (other team)`} · {pct(l.allocationPct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
