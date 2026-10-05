import { Fragment, useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { useFieldConflict, type FieldConflict } from '../state/ConflictUi';
import { useFieldFailure, useIsChangedByOthers, useRepository, type FieldFailure } from '../state/DataContext';
import type { PhaseDef } from '../brand/types';
import { actualOrEstimate } from '../data/cost';
import { formatMonth } from '../data/dates';
import { FILE_PATHS, type PhasePlan } from '../data/types';
import { AmountInput } from './AmountInput';
import { ConflictRow, inRow } from './ConflictBlock';
import { formatAmount, formatSignedAmount } from './formatAmount';
import { Button } from '@/components/ui/button';

/** A phase's actuals-table row anchor (§5.2, §8.5), for the Portfolio's Needs attention strip jumping to an Overdue month. */
export const actualCellAnchor = (phaseId: string, month: string) => `actual-${phaseId}-${month}`;

/**
 * A phase's actuals (§5.4, §7.3): a row per month that has closed or already has an actual (Month, Estimate, Actual,
 * Difference, buttons), and the months not closed yet folded into one line with their estimated total. One month at
 * a time; there is no bulk record (§1, Non-goals).
 */
export function ActualsTable({
  initiativeId,
  phase,
  plan,
  months,
  estimateByMonth,
  today,
}: {
  initiativeId: string;
  phase: PhaseDef;
  plan: PhasePlan;
  /** The phase's period months. */
  months: string[];
  estimateByMonth: Record<string, number>;
  today: string;
}) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const failure = useFieldFailure();
  const conflict = useFieldConflict();
  const { currencySymbol } = useBrand();
  const file = FILE_PATHS.initiative(initiativeId);

  const rows = months.filter((month) => actualOrEstimate(plan, month, today, estimateByMonth) !== undefined);
  const open = months.filter((month) => !rows.includes(month));
  const openTotal = open.reduce((sum, month) => sum + (estimateByMonth[month] ?? 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-heading text-text-primary">Actuals</h3>
      {rows.length > 0 && (
        <table className="tabular-nums w-full border-collapse text-body">
          <caption className="sr-only">{phase.label} actuals</caption>
          <thead>
            <tr className="text-left text-label text-text-secondary">
              <th className="py-1 pr-2 font-medium">Month</th>
              <th className="py-1 pr-2 text-right font-medium">Estimate</th>
              <th className="py-1 pr-2 text-right font-medium">Actual</th>
              <th className="py-1 pr-2 text-right font-medium">Difference</th>
              <th className="py-1 text-right font-medium">
                <span className="sr-only">Record</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((month) => {
              const path = ['phases', phase.id, 'actualMonths', month];
              const actualConflict = conflict(file, path);
              const estimate = estimateByMonth[month] ?? 0;
              return (
                <Fragment key={month}>
                  <tr id={actualCellAnchor(phase.id, month)} className="border-t border-border-default align-top">
                    <ActualRow
                      phase={phase}
                      month={month}
                      estimate={estimate}
                      recorded={plan.actualMonths?.[month]}
                      currencySymbol={currencySymbol}
                      changed={changed(file, path)}
                      failure={failure(file, path)}
                      conflict={inRow(actualConflict)}
                      onRecord={(amount) => repository.setActual(initiativeId, phase.id, month, amount)}
                    />
                  </tr>
                  <ConflictRow conflict={actualConflict} label={`Actual for ${phase.label} ${formatMonth(month)}`} colSpan={5} />
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {open.length > 0 && (
        <p className="m-0 text-caption text-text-secondary">
          {open.length === 1 ? formatMonth(open[0]) : `${formatMonth(open[0])} – ${formatMonth(open[open.length - 1])}`} · {open.length}{' '}
          {open.length === 1 ? 'month' : 'months'} not closed yet · {formatAmount(openTotal, currencySymbol)} estimated
        </p>
      )}
    </div>
  );
}

/** One month's cells (§7.3): a recorded actual with its difference and Change, or the estimate in use with Record and Different amount. */
function ActualRow({
  phase,
  month,
  estimate,
  recorded,
  currencySymbol,
  changed,
  failure,
  conflict,
  onRecord,
}: {
  phase: PhaseDef;
  month: string;
  estimate: number;
  /** The recorded actual, if any. */
  recorded: number | undefined;
  currencySymbol: string;
  changed: boolean;
  /** This field's file has a failed, unsaved edit at this field's own path (§3, §9.9). */
  failure: FieldFailure | null;
  /** A same-field conflict on this month's actual (§3, §9.9), shown in the row under it. */
  conflict: FieldConflict | null;
  onRecord: (amount: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const name = `${phase.label} ${formatMonth(month)}`;
  const record = (amount: number) => {
    onRecord(amount);
    setEditing(false);
  };
  // The estimate rounds to whole currency units on screen, so a difference that shows as €0 reads "On estimate".
  const difference = recorded === undefined ? undefined : recorded - estimate;
  const onEstimate = difference !== undefined && Math.abs(difference) < 0.5;
  const initialText = recorded === undefined ? '' : String(recorded);

  return (
    <>
      <td className="py-1.5 pr-2">{formatMonth(month)}</td>
      <td className="py-1.5 pr-2 text-right">{formatAmount(estimate, currencySymbol)}</td>
      <td className="py-1.5 pr-2 text-right">
        {editing ? (
          <div
            className="flex justify-end"
            onBlur={(e) => {
              // Leaving the field with nothing typed puts the row back; a typed entry is committed or refused by the field itself.
              if (!e.currentTarget.contains(e.relatedTarget) && (e.target as HTMLInputElement).value === initialText) setEditing(false);
            }}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          >
            <AmountInput
              autoFocus
              label={recorded === undefined ? `Override the actual for ${name}` : `Actual for ${name}`}
              currencySymbol={currencySymbol}
              value={recorded}
              placeholder="Actual"
              changed={changed}
              failure={failure}
              conflict={conflict}
              onChange={record}
            />
          </div>
        ) : recorded === undefined ? (
          <span className="text-text-muted">{formatAmount(estimate, currencySymbol)} · using the estimate</span>
        ) : (
          formatAmount(recorded, currencySymbol)
        )}
      </td>
      <td className={`py-1.5 pr-2 text-right ${difference !== undefined && !onEstimate && difference > 0 ? 'text-warning-text' : 'text-text-secondary'}`}>
        {difference === undefined ? '—' : onEstimate ? 'On estimate' : formatSignedAmount(difference, currencySymbol)}
      </td>
      <td className="py-1 text-right">
        {!editing && (
          <div className="flex justify-end gap-1">
            {recorded === undefined ? (
              <>
                <Button type="button" variant="outline" size="sm" aria-label={`Record ${formatAmount(estimate, currencySymbol)} as the actual for ${name}`} onClick={() => record(estimate)}>
                  Record {formatAmount(estimate, currencySymbol)}
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Different amount for ${name}`} onClick={() => setEditing(true)}>
                  Different amount
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" size="sm" aria-label={`Change the actual for ${name}`} onClick={() => setEditing(true)}>
                Change
              </Button>
            )}
          </div>
        )}
      </td>
    </>
  );
}
