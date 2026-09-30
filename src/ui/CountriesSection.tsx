import { Fragment, useId, useMemo, useState, type ComponentProps } from 'react';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { useBrand } from '../state/BrandContext';
import { parseAmount, trackedYears, yearRecord } from '../data/cost';
import { MONTHS, formatMonth, monthKey } from '../data/dates';
import { daysInMonth, initiativesAffectedByRate, weekdaysByMonth, type RateEdit } from '../data/rates';
import { FILE_PATHS, type Country, type CountryYearRateRecord } from '../data/types';
import { CommitInput, Refusal } from './CommitInput';
import { formatAmount } from './formatAmount';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, DeactivateIcon, PlusIcon, ReactivateIcon } from './icons';
import { LockToggle } from './LockToggle';
import type { SectionLock } from './useSectionLock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const NAME_REFUSAL = 'Enter a name.';
const DAY_RATE_REFUSAL = 'Enter a day rate of 0 or more.';

/** Whole days from 0 to the month's calendar days, or null (§5.9). */
function parseWorkingDays(text: string, max: number): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const value = Number(text);
  return value <= max ? value : null;
}

/** "changes the estimate of N initiative(s).": 029's impact note, after the edit's own subject. */
function changes(n: number): string {
  if (n === 0) return 'changes no estimates.';
  return `changes the estimate of ${n} ${n === 1 ? 'initiative' : 'initiatives'}.`;
}

/** "2026, 2027 and 2028". */
function listYears(years: number[]): string {
  return years.length < 2 ? years.join('') : `${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`;
}

/**
 * Settings' Countries & rates section (§5.9): a lockable list of countries, each opening in place to one table
 * with a row per tracked year — the day rate and twelve months of working days. Rates are correct confirms the
 * rates without editing them (§5.2). `today` fixes the tracked window (§7.2).
 */
export function CountriesSection({ lock, today = new Date() }: { lock: SectionLock; today?: Date }) {
  const repository = useRepository();
  const { countries, initiatives, people, datasetFlags } = useRepositoryState();
  const { currencySymbol } = useBrand();
  const failure = useFieldFailure();
  const changed = useIsChangedByOthers();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  // The open country's latest impact note (§5.9): replaced by the next edit, gone when the country closes.
  const [impact, setImpact] = useState<{ countryId: string; text: string } | null>(null);

  const tracked = trackedYears(today);
  const sorted = useMemo(() => [...countries].sort((a, b) => a.name.localeCompare(b.name)), [countries]);

  const toggle = (id: string) => {
    setOpenId((current) => (current === id ? null : id));
    setImpact(null);
  };
  const noteImpact = (country: Country, edit: RateEdit, subject: string) =>
    setImpact({ countryId: country.id, text: `${subject}: ${changes(initiativesAffectedByRate(country, edit, initiatives, people))}` });

  return (
    <section aria-labelledby="settings-countries-title" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 id="settings-countries-title" className="m-0 text-lg font-semibold">
          Countries &amp; rates
        </h2>
        <div className="flex items-center gap-2">
          {datasetFlags?.ratesReviewed ? (
            <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
              <CheckIcon width={16} height={16} />
              Rates reviewed
            </span>
          ) : (
            // Usable while locked: it confirms the rates, it doesn't edit them (§5.9).
            <Button type="button" variant="outline" size="sm" onClick={() => repository.confirmRates()}>
              <CheckIcon width={16} height={16} />
              Rates are correct
            </Button>
          )}
          <LockToggle lock={lock} />
        </div>
      </div>
      {lock.locked && <p className="m-0 text-sm text-text-secondary">Locked. Unlock to edit.</p>}

      <table className="mt-3 w-full border-collapse text-sm">
        <caption className="sr-only">Countries</caption>
        <thead>
          <tr className="text-left text-xs text-text-secondary">
            <th className="py-1 pr-2 font-medium">Name</th>
            <th className="py-1 pr-2 text-right font-medium">Day rate</th>
            <th className="w-10 py-1">
              <span className="sr-only">Active</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((country) => {
            const open = openId === country.id;
            const current = yearRecord(country.ratesByYear, tracked[0]);
            const tableId = `country-rates-${country.id}`;
            return (
              <Fragment key={country.id}>
                <tr
                  className={`border-t border-border-default align-middle ${country.active ? '' : 'text-text-secondary'} ${open ? 'bg-surface-subtle' : ''} ${lock.locked ? 'cursor-pointer' : ''}`}
                  // Locked, the whole row opens the country; unlocked, the name is a field, so only the chevron does.
                  onClick={lock.locked ? () => toggle(country.id) : undefined}
                >
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={open}
                        aria-controls={open ? tableId : undefined}
                        aria-label={`${open ? 'Hide' : 'Show'} ${country.name}’s rates`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(country.id);
                        }}
                      >
                        {open ? <ChevronDownIcon width={16} height={16} /> : <ChevronRightIcon width={16} height={16} />}
                      </Button>
                      {lock.locked ? (
                        <span className="font-medium">{country.name}</span>
                      ) : (
                        <CommitInput
                          aria-label={`Name of ${country.name}`}
                          className="w-48"
                          value={country.name}
                          changed={changed(FILE_PATHS.countries, [{ id: country.id }, 'name'])}
                          failure={failure(FILE_PATHS.countries, [{ id: country.id }, 'name'])}
                          retryLabel={`Retry saving the name of ${country.name}`}
                          onCommit={(text) => {
                            const name = text.trim();
                            if (name === '') return NAME_REFUSAL;
                            if (name === country.name) return false;
                            repository.updateCountry(country.id, { name });
                          }}
                        />
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {current ? `${formatAmount(current.dayRate, currencySymbol)} / day (${tracked[0]})` : '—'}
                  </td>
                  <td className="py-1.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={lock.locked}
                      aria-label={`${country.active ? 'Deactivate' : 'Reactivate'} ${country.name}`}
                      title={country.active ? 'Deactivate' : 'Reactivate'}
                      onClick={(e) => {
                        e.stopPropagation();
                        repository.updateCountry(country.id, { active: !country.active });
                      }}
                    >
                      {country.active ? <DeactivateIcon /> : <ReactivateIcon />}
                    </Button>
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td id={tableId} colSpan={3} className="border-t border-border-default bg-surface-card px-4 pt-2 pb-3">
                      {impact?.countryId === country.id && <p className="m-0 mb-2 text-xs text-text-secondary">{impact.text}</p>}
                      <YearTable
                        country={country}
                        tracked={tracked}
                        locked={lock.locked}
                        currencySymbol={currencySymbol}
                        onDayRate={(year, dayRate) => {
                          repository.setCountryDayRate(country.id, year, dayRate);
                          noteImpact(country, { year, field: 'dayRate' }, `${year} day rate`);
                        }}
                        onWorkingDays={(year, month, days) => {
                          repository.setCountryWorkingDays(country.id, year, month, days);
                          noteImpact(country, { year, field: 'workingDays', month }, `${formatMonth(monthKey(year, month))} working days`);
                        }}
                        onReset={(year) => {
                          repository.resetCountryWorkingDays(country.id, year);
                          noteImpact(country, { year, field: 'workingDays' }, `${year} working days reset to weekdays`);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {drafting ? (
        <DraftCountryRow
          years={tracked}
          currencySymbol={currencySymbol}
          onCancel={() => setDrafting(false)}
          onAdd={(draft) => {
            repository.createCountry(draft, today);
            setDrafting(false);
          }}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" className="mt-3 self-start" disabled={lock.locked} onClick={() => setDrafting(true)}>
          <PlusIcon width={16} height={16} />
          Add country
        </Button>
      )}
    </section>
  );
}

/** One country's year table (§5.9, §7.2): the tracked years, editable while unlocked, then the years that left the window, read-only and collapsed. */
function YearTable({
  country,
  tracked,
  locked,
  currencySymbol,
  onDayRate,
  onWorkingDays,
  onReset,
}: {
  country: Country;
  tracked: number[];
  locked: boolean;
  currencySymbol: string;
  onDayRate: (year: number, dayRate: number) => void;
  onWorkingDays: (year: number, month: number, days: number) => void;
  onReset: (year: number) => void;
}) {
  const [showEarlier, setShowEarlier] = useState(false);
  const earlierId = useId();
  const byYear = [...country.ratesByYear].sort((a, b) => a.year - b.year);
  const current = byYear.filter((r) => tracked.includes(r.year));
  const earlier = byYear.filter((r) => r.year < tracked[0]);

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{country.name} rates by year</caption>
      <thead>
        <tr className="text-left text-xs text-text-secondary">
          <th className="py-1 pr-2 font-medium">Year</th>
          <th className="py-1 pr-3 text-right font-medium">Day rate</th>
          {MONTHS.map((m) => (
            <th key={m} className="w-11 py-1 text-center font-medium">
              {m}
            </th>
          ))}
          <th className="py-1">
            <span className="sr-only">Reset</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {current.map((record) => (
          <YearRow
            key={record.year}
            country={country}
            record={record}
            readOnly={locked}
            showReset={!locked}
            currencySymbol={currencySymbol}
            onDayRate={onDayRate}
            onWorkingDays={onWorkingDays}
            onReset={onReset}
          />
        ))}
        {earlier.length > 0 && (
          <tr className="border-t border-border-default text-text-secondary">
            <td colSpan={15} className="py-1">
              <Button type="button" variant="ghost" size="sm" aria-expanded={showEarlier} aria-controls={earlierId} onClick={() => setShowEarlier((v) => !v)}>
                {showEarlier ? <ChevronDownIcon width={16} height={16} /> : <ChevronRightIcon width={16} height={16} />}
                Earlier years <span className="text-text-muted">({earlier.map((r) => r.year).join(', ')})</span>
              </Button>
            </td>
          </tr>
        )}
      </tbody>
      {earlier.length > 0 && showEarlier && (
        <tbody id={earlierId} className="text-text-secondary">
          {earlier.map((record) => (
            <YearRow key={record.year} country={country} record={record} readOnly showReset={false} currencySymbol={currencySymbol} />
          ))}
        </tbody>
      )}
    </table>
  );
}

function YearRow({
  country,
  record,
  readOnly,
  showReset,
  currencySymbol,
  onDayRate,
  onWorkingDays,
  onReset,
}: {
  country: Country;
  record: CountryYearRateRecord;
  readOnly: boolean;
  showReset: boolean;
  currencySymbol: string;
  onDayRate?: (year: number, dayRate: number) => void;
  onWorkingDays?: (year: number, month: number, days: number) => void;
  onReset?: (year: number) => void;
}) {
  const changed = useIsChangedByOthers();
  const failure = useFieldFailure();
  const { year } = record;
  const weekdays = weekdaysByMonth(year);
  const matchesWeekdays = record.workingDaysByMonth.every((d, i) => d === weekdays[i]);
  const ratesChanged = changed(FILE_PATHS.countries, [{ id: country.id }, 'ratesByYear']);
  const ratesFailure = failure(FILE_PATHS.countries, [{ id: country.id }, 'ratesByYear']);

  return (
    <tr className="border-t border-border-default align-top">
      <th scope="row" className="py-1.5 pr-2 text-left leading-8 font-medium tabular-nums">
        {year}
      </th>
      <td className="py-1.5 pr-3 text-right">
        {readOnly ? (
          <span className="inline-flex h-8 items-center tabular-nums">{formatAmount(record.dayRate, currencySymbol)}</span>
        ) : (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <span className="leading-8 text-text-secondary">{currencySymbol}</span>
              <CommitInput
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                aria-label={`Day rate ${year}, ${country.name}`}
                className="h-8 w-24 text-right"
                errorClassName="mt-1 text-left"
                value={String(record.dayRate)}
                changed={ratesChanged}
                failure={ratesFailure}
                retryLabel={`Retry saving the ${year} day rate of ${country.name}`}
                onCommit={(text) => {
                  const dayRate = parseAmount(text);
                  if (dayRate === null) return DAY_RATE_REFUSAL;
                  if (dayRate === record.dayRate) return false;
                  onDayRate?.(year, dayRate);
                }}
              />
            </div>
          </div>
        )}
      </td>
      {record.workingDaysByMonth.map((days, month) => (
        <td key={month} className="py-1.5 text-center">
          <WorkingDaysCell
            country={country}
            year={year}
            month={month}
            days={days}
            weekdays={weekdays[month]}
            readOnly={readOnly}
            changed={ratesChanged}
            onCommit={(value) => onWorkingDays?.(year, month, value)}
          />
        </td>
      ))}
      <td className="py-1.5 pl-2 text-right">
        {showReset && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-brand-accent-text"
            disabled={matchesWeekdays}
            aria-label={`Reset to weekdays for ${year}`}
            onClick={() => onReset?.(year)}
          >
            Reset to weekdays
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * One month's working days. A value that differs from the month's weekdays is tinted with a dot, says so in a
 * tooltip on hover and focus, and in its accessible name (§5.9, §9.5: never colour alone).
 */
function WorkingDaysCell({
  country,
  year,
  month,
  days,
  weekdays,
  readOnly,
  changed,
  onCommit,
}: {
  country: Country;
  year: number;
  month: number;
  days: number;
  weekdays: number;
  readOnly: boolean;
  changed: boolean;
  onCommit: (days: number) => void;
}) {
  const differs = days !== weekdays;
  const differsText = `Differs from ${weekdays} weekdays`;
  const max = daysInMonth(year, month);
  const name = `Working days in ${formatMonth(monthKey(year, month))}, ${country.name}${differs ? `, differs from ${weekdays} weekdays` : ''}`;
  const tint = differs ? 'border-border-strong bg-surface-subtle' : '';

  const cell = readOnly ? (
    <span className={`relative inline-flex h-8 w-11 items-center justify-center rounded-md border tabular-nums ${differs ? tint : 'border-transparent'}`}>
      {days}
      {differs && <span className="sr-only">, {differsText.toLowerCase()}</span>}
      {differs && <Dot />}
    </span>
  ) : (
    <span className="relative inline-flex flex-col items-center">
      <CommitInput
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        aria-label={name}
        // No spinner: it would cover a two-digit value in a cell this narrow.
        className={`h-8 w-11 [appearance:textfield] px-1 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${tint}`}
        errorClassName="absolute top-full z-10 mt-1 w-max"
        value={String(days)}
        changed={changed}
        onCommit={(text) => {
          const value = parseWorkingDays(text, max);
          if (value === null) return `Enter whole days from 0 to ${max}.`;
          if (value === days) return false;
          onCommit(value);
        }}
      />
      {differs && <Dot />}
    </span>
  );

  if (!differs) return cell;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent>{differsText}</TooltipContent>
    </Tooltip>
  );
}

/** The differing cell's second cue besides its tint (§9.5). */
function Dot() {
  return <span aria-hidden="true" className="pointer-events-none absolute top-0.5 right-0.5 size-1.5 rounded-full bg-text-secondary" />;
}

/** The unsaved country row: nothing is committed until Add, which needs a name and a day rate of 0 or more. */
function DraftCountryRow({
  years,
  currencySymbol,
  onAdd,
  onCancel,
}: {
  years: number[];
  currencySymbol: string;
  onAdd: (draft: { name: string; dayRate: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [refused, setRefused] = useState<{ name?: string; dayRate?: string }>({});
  const nameErrorId = useId();
  const dayRateErrorId = useId();
  const hintId = useId();

  const add = () => {
    const trimmed = name.trim();
    const parsed = parseAmount(dayRate);
    setRefused({ name: trimmed === '' ? NAME_REFUSAL : undefined, dayRate: parsed === null ? DAY_RATE_REFUSAL : undefined });
    if (trimmed !== '' && parsed !== null) onAdd({ name: trimmed, dayRate: parsed });
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') add();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border-strong p-3" role="group" aria-label="New country">
      <div className="flex flex-wrap items-start gap-3">
        <DraftField
          aria-label="Name"
          placeholder="Name"
          className="w-48"
          autoFocus
          value={name}
          errorId={nameErrorId}
          error={refused.name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={keys}
        />
        <div className="flex items-start gap-1">
          <span className="inline-flex h-8 items-center text-text-secondary">{currencySymbol}</span>
          <DraftField
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            aria-label="Day rate"
            placeholder="Day rate"
            className="w-28 text-right"
            value={dayRate}
            errorId={dayRateErrorId}
            error={refused.dayRate}
            hintId={hintId}
            onChange={(e) => setDayRate(e.target.value)}
            onKeyDown={keys}
          />
        </div>
      </div>
      <p id={hintId} className="m-0 text-xs text-text-secondary">
        Used for {listYears(years)}. Working days start as the weekdays of each month.
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!name.trim()} onClick={add}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** One draft-row field: an `Input` with its refusal message wired up via `aria-invalid`/`aria-describedby`. */
function DraftField({ errorId, error, hintId, ...input }: ComponentProps<typeof Input> & { errorId: string; error?: string; hintId?: string }) {
  const describedBy = [error ? errorId : null, hintId ?? null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <Input aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {error && <Refusal id={errorId}>{error}</Refusal>}
    </div>
  );
}
