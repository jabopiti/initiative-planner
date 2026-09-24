import { trackedYears, yearRecord } from '../data/cost';
import type { CustomRole, Person } from '../data/types';
import { useBrand } from '../state/BrandContext';
import { useIsChangedByOthers, useRepository } from '../state/DataContext';
import { Label } from '@/components/ui/label';
import { CommitInput } from './CommitInput';
import { InlineWarning } from './InlineWarning';

/** The parse every number field here shares: blank or not a non-negative number is rejected. */
function parseAmount(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isNaN(value) || value < 0 ? null : value;
}

/**
 * A person's custom role (§5.6, §6): label, cost factor and a day rate per tracked year. A year with
 * no entered rate takes the nearest earlier entered year's (§7.2) and the row says which.
 */
export function CustomRoleFields({ person, customRole }: { person: Person; customRole: CustomRole }) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const customPath = (field: string) => [{ id: person.id }, 'customRole', field];
  const { currencySymbol } = useBrand();
  const save = (patch: Partial<CustomRole>) => repository.updatePerson(person.id, { customRole: { ...customRole, ...patch } });

  const tracked = trackedYears();
  const past = customRole.dayRatesByYear.map((r) => r.year).filter((y) => y < tracked[0]).sort();
  const rows = [...past, ...tracked];

  const setRate = (year: number, text: string) => {
    const others = customRole.dayRatesByYear.filter((r) => r.year !== year);
    if (text.trim() === '') {
      save({ dayRatesByYear: others });
      return;
    }
    const dayRate = parseAmount(text);
    if (dayRate === null) return false;
    save({ dayRatesByYear: [...others, { year, dayRate }].sort((a, b) => a.year - b.year) });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="person-custom-label">Custom role label</Label>
        <CommitInput
          id="person-custom-label"
          changed={changed('people.json', customPath('label'))}
          placeholder="e.g. Fractional CTO"
          value={customRole.label}
          onCommit={(text) => {
            if (text.trim() === customRole.label) return false;
            save({ label: text.trim() });
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="person-custom-factor">Cost factor</Label>
        <CommitInput
          id="person-custom-factor"
          changed={changed('people.json', customPath('costFactor'))}
          type="number"
          step="any"
          min={0}
          className="w-24"
          value={String(customRole.costFactor)}
          onCommit={(text) => {
            const costFactor = parseAmount(text);
            if (costFactor === null || costFactor === customRole.costFactor) return false;
            save({ costFactor });
          }}
        />
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium">Day rate per year</legend>
        {rows.map((year) => {
          const entered = customRole.dayRatesByYear.find((r) => r.year === year);
          const inherited = entered ? undefined : yearRecord(customRole.dayRatesByYear, year);
          return (
            <div key={year} className="flex items-center gap-2">
              <span className="w-10 text-sm tabular-nums">{year}</span>
              <span className="text-sm text-text-secondary">{currencySymbol}</span>
              <CommitInput
                type="number"
                step="any"
                min={0}
                className="w-28"
                aria-label={`Day rate ${year}`}
                changed={changed('people.json', customPath('dayRatesByYear'))}
                disabled={year < tracked[0]}
                placeholder={inherited ? String(inherited.dayRate) : undefined}
                value={entered ? String(entered.dayRate) : ''}
                onCommit={(text) => setRate(year, text)}
              />
              <span className="text-sm text-text-secondary">per day</span>
              {inherited && <span className="text-xs text-text-muted">uses {inherited.year}</span>}
            </div>
          );
        })}
      </fieldset>

      {customRole.dayRatesByYear.length === 0 && (
        <InlineWarning>No rate yet. Costed at 0.</InlineWarning>
      )}
      <p className="m-0 text-xs text-text-secondary">Replaces the country rate. Cost is day rate × cost factor.</p>
    </div>
  );
}
