import { useId, useMemo, useState } from 'react';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { parseAmount } from '../data/cost';
import { initiativesAffectedByRole } from '../data/roleImpact';
import { FILE_PATHS } from '../data/types';
import { CommitInput, Refusal } from './CommitInput';
import { DeactivateIcon, PlusIcon, ReactivateIcon } from './icons';
import { LockToggle } from './LockToggle';
import type { SectionLock } from './useSectionLock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const NAME_REFUSAL = 'Enter a name.';
const ABBREVIATION_REFUSAL = 'Enter an abbreviation.';
const COST_FACTOR_REFUSAL = 'Enter a cost factor above 0.';

function parseCostFactor(text: string): number | null {
  const value = parseAmount(text);
  return value !== null && value > 0 ? value : null;
}

/** "N initiative(s)": the one spelling of the impact note's count. */
function initiativeCount(n: number): string {
  return `${n} ${n === 1 ? 'initiative' : 'initiatives'}`;
}

/** Settings' Roles section (§5.9): a lockable table, edited in place, with Add role and an impact note after a cost-factor edit. */
export function RolesSection({ lock }: { lock: SectionLock }) {
  const repository = useRepository();
  const { roles, initiatives, people } = useRepositoryState();
  const changed = useIsChangedByOthers();
  const failure = useFieldFailure();
  const [drafting, setDrafting] = useState(false);
  // Which initiatives a cost-factor change affects, by role id: shown until that role's cost factor is edited again (§5.9).
  const [impact, setImpact] = useState<Record<string, number>>({});

  const sorted = useMemo(() => [...roles].sort((a, b) => a.name.localeCompare(b.name)), [roles]);

  return (
    <section aria-labelledby="settings-roles-title" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 id="settings-roles-title" className="m-0 text-lg font-semibold">
          Roles
        </h2>
        <LockToggle lock={lock} />
      </div>
      {lock.locked && <p className="m-0 text-sm text-text-secondary">Locked. Unlock to edit.</p>}

      <table className="mt-3 w-full border-collapse text-sm">
        <caption className="sr-only">Roles</caption>
        <thead>
          <tr className="text-left text-xs text-text-secondary">
            <th className="py-1 pr-2 font-medium">Name</th>
            <th className="py-1 pr-2 font-medium">Abbreviation</th>
            <th className="py-1 pr-2 text-right font-medium">Cost factor</th>
            <th className="w-8 py-1">
              <span className="sr-only">Active</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((role) => {
            const roleChanged = (field: string) => changed(FILE_PATHS.roles, [{ id: role.id }, field]);
            const roleFailure = (field: string) => failure(FILE_PATHS.roles, [{ id: role.id }, field]);
            return (
              <tr key={role.id} className={`border-t border-border-default align-top ${role.active ? '' : 'text-text-secondary'}`}>
                <td className="py-1.5 pr-2">
                  <CommitInput
                    aria-label={`Name of ${role.name}`}
                    className="w-full min-w-32"
                    disabled={lock.locked}
                    value={role.name}
                    changed={roleChanged('name')}
                    failure={roleFailure('name')}
                    retryLabel={`Retry saving the name of ${role.name}`}
                    onCommit={(text) => {
                      const name = text.trim();
                      if (name === '') return NAME_REFUSAL;
                      if (name === role.name) return false;
                      repository.updateRole(role.id, { name });
                    }}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <CommitInput
                    aria-label={`Abbreviation of ${role.name}`}
                    className="w-24"
                    disabled={lock.locked}
                    value={role.abbreviation}
                    changed={roleChanged('abbreviation')}
                    failure={roleFailure('abbreviation')}
                    retryLabel={`Retry saving the abbreviation of ${role.name}`}
                    onCommit={(text) => {
                      const abbreviation = text.trim();
                      if (abbreviation === '') return ABBREVIATION_REFUSAL;
                      if (abbreviation === role.abbreviation) return false;
                      repository.updateRole(role.id, { abbreviation });
                    }}
                  />
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <CommitInput
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    aria-label={`Cost factor for ${role.name}`}
                    className="w-20 text-right"
                    errorClassName="mt-1 text-left"
                    disabled={lock.locked}
                    value={String(role.costFactor)}
                    changed={roleChanged('costFactor')}
                    failure={roleFailure('costFactor')}
                    retryLabel={`Retry saving the cost factor for ${role.name}`}
                    onCommit={(text) => {
                      const costFactor = parseCostFactor(text);
                      if (costFactor === null) return COST_FACTOR_REFUSAL;
                      if (costFactor === role.costFactor) return false;
                      repository.updateRole(role.id, { costFactor });
                      setImpact((current) => ({ ...current, [role.id]: initiativesAffectedByRole(role.id, initiatives, people) }));
                    }}
                  />
                  {impact[role.id] !== undefined && (
                    <p className="m-0 mt-1 text-xs text-text-secondary">Changes the estimate of {initiativeCount(impact[role.id])}.</p>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={lock.locked}
                    aria-label={`${role.active ? 'Deactivate' : 'Reactivate'} ${role.name}`}
                    title={role.active ? 'Deactivate' : 'Reactivate'}
                    onClick={() => repository.updateRole(role.id, { active: !role.active })}
                  >
                    {role.active ? <DeactivateIcon /> : <ReactivateIcon />}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {drafting ? (
        <DraftRoleRow
          onCancel={() => setDrafting(false)}
          onAdd={(draft) => {
            repository.createRole(draft);
            setDrafting(false);
          }}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" className="mt-3 self-start" disabled={lock.locked} onClick={() => setDrafting(true)}>
          <PlusIcon width={16} height={16} />
          Add role
        </Button>
      )}
    </section>
  );
}

/** The unsaved role row: nothing is committed until Add, which needs a name, an abbreviation and a cost factor above 0. */
function DraftRoleRow({
  onAdd,
  onCancel,
}: {
  onAdd: (draft: { name: string; abbreviation: string; costFactor: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [costFactor, setCostFactor] = useState('1');
  const [refused, setRefused] = useState<{ name?: string; abbreviation?: string; costFactor?: string }>({});
  const nameErrorId = useId();
  const abbreviationErrorId = useId();
  const costFactorErrorId = useId();

  const add = () => {
    const trimmedName = name.trim();
    const trimmedAbbreviation = abbreviation.trim();
    const parsedCostFactor = parseCostFactor(costFactor);
    setRefused({
      name: trimmedName === '' ? NAME_REFUSAL : undefined,
      abbreviation: trimmedAbbreviation === '' ? ABBREVIATION_REFUSAL : undefined,
      costFactor: parsedCostFactor === null ? COST_FACTOR_REFUSAL : undefined,
    });
    if (trimmedName !== '' && trimmedAbbreviation !== '' && parsedCostFactor !== null) {
      onAdd({ name: trimmedName, abbreviation: trimmedAbbreviation, costFactor: parsedCostFactor });
    }
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') add();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border-strong p-3" role="group" aria-label="New role">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <Input
            aria-label="Name"
            placeholder="Name"
            className="w-48"
            autoFocus
            value={name}
            aria-invalid={refused.name ? true : undefined}
            aria-describedby={refused.name ? nameErrorId : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={keys}
          />
          {refused.name && <Refusal id={nameErrorId}>{refused.name}</Refusal>}
        </div>
        <div className="flex flex-col gap-1">
          <Input
            aria-label="Abbreviation"
            placeholder="Abbreviation"
            className="w-28"
            value={abbreviation}
            aria-invalid={refused.abbreviation ? true : undefined}
            aria-describedby={refused.abbreviation ? abbreviationErrorId : undefined}
            onChange={(e) => setAbbreviation(e.target.value)}
            onKeyDown={keys}
          />
          {refused.abbreviation && <Refusal id={abbreviationErrorId}>{refused.abbreviation}</Refusal>}
        </div>
        <div className="flex flex-col gap-1">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            aria-label="Cost factor"
            placeholder="Cost factor"
            className="w-24"
            value={costFactor}
            aria-invalid={refused.costFactor ? true : undefined}
            aria-describedby={refused.costFactor ? costFactorErrorId : undefined}
            onChange={(e) => setCostFactor(e.target.value)}
            onKeyDown={keys}
          />
          {refused.costFactor && <Refusal id={costFactorErrorId}>{refused.costFactor}</Refusal>}
        </div>
      </div>
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
