import { useId, useState } from 'react';
import { useBrand } from '../state/BrandContext';
import { useIsChangedByOthers, useRepository } from '../state/DataContext';
import type { PhaseDef } from '../brand/types';
import { isOutsidePeriod, parseAmount, periodMonths } from '../data/cost';
import { formatMonth, localToday, monthOf } from '../data/dates';
import { FILE_PATHS, type CostItem, type PhasePlan } from '../data/types';
import { CommitInput, Refusal } from './CommitInput';
import { InlineWarning } from './InlineWarning';
import { MonthInput } from './MonthInput';
import { PlusIcon, RemoveIcon } from './icons';
import { TIMING_LABELS } from './costItemTiming';
import { undoToast } from './undoToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const LABEL_REFUSAL = 'Enter a label.';
const AMOUNT_REFUSAL = 'Enter an amount of 0 or more.';

/** The month a new one-month item starts on: the phase's first month, or this month while the period is unset. */
const defaultMonth = (months: string[]): string => months[0] ?? monthOf(localToday());

function TimingToggle({ value, label, onChange }: { value: CostItem['timing']; label: string; onChange: (timing: CostItem['timing']) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      aria-label={label}
      // Selecting the selected segment again would deselect it; a timing is always chosen.
      onValueChange={(next) => next && onChange(next as CostItem['timing'])}
    >
      {(Object.keys(TIMING_LABELS) as CostItem['timing'][]).map((timing) => (
        <ToggleGroupItem key={timing} value={timing}>
          {TIMING_LABELS[timing]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A phase's cost items (§5.4): a table edited in place, and a draft row that is saved once, on Add. */
export function CostItemsTable({ initiativeId, phase, plan }: { initiativeId: string; phase: PhaseDef; plan: PhasePlan }) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const { currencySymbol } = useBrand();
  const file = FILE_PATHS.initiative(initiativeId);
  const items = plan.costItems ?? [];
  // The period's months, once for every row: the outside-the-period warning and the default month read them.
  const months = periodMonths(plan);
  const [drafting, setDrafting] = useState(false);

  return (
    <section aria-labelledby={`cost-items-${phase.id}`} className="flex flex-col gap-2">
      <h3 id={`cost-items-${phase.id}`} className="m-0 text-sm font-medium">
        Cost items
      </h3>
      {items.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{phase.label} cost items</caption>
          <thead>
            <tr className="text-left text-xs text-text-secondary">
              <th className="py-1 pr-2 font-medium">Label</th>
              <th className="py-1 pr-2 font-medium">Amount</th>
              <th className="py-1 pr-2 font-medium">When</th>
              <th className="w-8 py-1">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const itemChanged = (field: string) => changed(file, ['phases', phase.id, 'costItems', { id: item.id }, field]);
              return (
                <tr key={item.id} className="border-t border-border-default align-top">
                  <td className="py-1.5 pr-2">
                    <CommitInput
                      aria-label={`Label of ${item.label}`}
                      className="w-full min-w-32"
                      value={item.label}
                      changed={itemChanged('label')}
                      onCommit={(text) => {
                        const label = text.trim();
                        if (label === '') return LABEL_REFUSAL;
                        if (label === item.label) return false; // only whitespace differed: the field shows the saved label again
                        repository.updateCostItem(initiativeId, phase.id, item.id, { label });
                      }}
                    />
                    {isOutsidePeriod(months, item) && (
                      <InlineWarning className="mt-1">{formatMonth(item.month!)} is outside the phase&apos;s period. It still counts.</InlineWarning>
                    )}
                  </td>
                  <td className="min-w-40 py-1.5 pr-2">
                    <div className="flex flex-wrap items-center gap-x-1">
                      <span className="text-sm text-text-secondary">{currencySymbol}</span>
                      <CommitInput
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        aria-label={`Amount for ${item.label}`}
                        className="w-28"
                        errorClassName="mt-1 order-last w-full"
                        value={String(item.amount)}
                        changed={itemChanged('amount')}
                        onCommit={(text) => {
                          const amount = parseAmount(text);
                          if (amount === null) return AMOUNT_REFUSAL;
                          if (amount === item.amount) return false;
                          repository.updateCostItem(initiativeId, phase.id, item.id, { amount });
                        }}
                      />
                    </div>
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex flex-col items-start gap-2">
                      <TimingToggle
                        value={item.timing}
                        label={`When for ${item.label}`}
                        onChange={(timing) =>
                          repository.updateCostItem(initiativeId, phase.id, item.id, timing === 'month' ? { timing, month: item.month ?? defaultMonth(months) } : { timing })
                        }
                      />
                      {item.timing === 'month' && (
                        <MonthInput
                          required
                          label={`Month for ${item.label}`}
                          value={item.month}
                          changed={itemChanged('month')}
                          onChange={(month) => month && repository.updateCostItem(initiativeId, phase.id, item.id, { month })}
                        />
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.label} from ${phase.label}`}
                      onClick={() => {
                        const removed = repository.removeCostItem(initiativeId, phase.id, item.id);
                        if (!removed) return;
                        undoToast(() => repository.restoreCostItem(initiativeId, phase.id, removed.item, removed.index));
                      }}
                    >
                      <RemoveIcon />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {drafting ? (
        <DraftRow
          phase={phase}
          months={months}
          onCancel={() => setDrafting(false)}
          onAdd={(draft) => {
            repository.addCostItem(initiativeId, phase.id, draft);
            setDrafting(false);
          }}
        />
      ) : (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          {items.length === 0 && 'No cost items yet —'}
          <AddButton phase={phase} onClick={() => setDrafting(true)} />
        </div>
      )}
    </section>
  );
}

function AddButton({ phase, onClick }: { phase: PhaseDef; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" aria-label={`Add cost item to ${phase.label}`} onClick={onClick}>
      <PlusIcon width={16} height={16} />
      Add cost item
    </Button>
  );
}

/** The unsaved row: nothing is committed until Add, which needs a label and an amount of 0 or more. */
function DraftRow({
  phase,
  months,
  onAdd,
  onCancel,
}: {
  phase: PhaseDef;
  /** The phase's period months, for the month a one-month item starts on. */
  months: string[];
  onAdd: (draft: Omit<CostItem, 'id'>) => void;
  onCancel: () => void;
}) {
  const { currencySymbol } = useBrand();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [timing, setTiming] = useState<CostItem['timing']>('spread');
  // Until one is picked, the month follows the phase's period, which may still change while the row is open.
  const [pickedMonth, setMonth] = useState<string>();
  const month = pickedMonth ?? defaultMonth(months);
  const [refused, setRefused] = useState<{ label?: string; amount?: string }>({});
  const labelErrorId = useId();
  const amountErrorId = useId();

  const add = () => {
    const parsed = parseAmount(amount);
    const text = label.trim();
    setRefused({ label: text === '' ? LABEL_REFUSAL : undefined, amount: parsed === null ? AMOUNT_REFUSAL : undefined });
    if (text !== '' && parsed !== null) onAdd({ label: text, amount: parsed, timing, ...(timing === 'month' && { month }) });
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') add();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-strong p-3" role="group" aria-label={`New cost item for ${phase.label}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <Input
            aria-label="Label"
            placeholder="Label"
            className="w-56"
            autoFocus
            value={label}
            aria-invalid={refused.label ? true : undefined}
            aria-describedby={refused.label ? labelErrorId : undefined}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={keys}
          />
          {refused.label && <Refusal id={labelErrorId}>{refused.label}</Refusal>}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-sm text-text-secondary">{currencySymbol}</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              aria-label="Amount"
              placeholder="Amount"
              className="w-28"
              value={amount}
              aria-invalid={refused.amount ? true : undefined}
              aria-describedby={refused.amount ? amountErrorId : undefined}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={keys}
            />
          </div>
          {refused.amount && <Refusal id={amountErrorId}>{refused.amount}</Refusal>}
        </div>
        <TimingToggle value={timing} label="When" onChange={setTiming} />
        {timing === 'month' && <MonthInput required label="Month" value={month} onChange={(next) => next && setMonth(next)} />}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={add}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
