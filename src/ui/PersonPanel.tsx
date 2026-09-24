import { useRef } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { claimedFtePct, unclaimedCapacityPct } from '../data/capacity';
import type { Person } from '../data/types';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeactivateIcon, PlusIcon, ReactivateIcon, RemoveIcon, TeamsIcon } from './icons';
import { CommitInput } from './CommitInput';
import { CustomRoleFields } from './CustomRoleFields';
import { PercentInput } from './PercentInput';
import { teamColorClass } from './teamColors';

/** Person detail drawer (§5.6), shared by every view that opens a person. Carries no warnings and no allocation list. */
export function PersonPanel({ person, onClose }: { person: Person | null; onClose: () => void }) {
  // The drawer has no trigger element, so hand focus back to whatever opened it (§5.6).
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Sheet open={person !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-96 overflow-y-auto p-4"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          opener.current?.focus();
        }}
      >
        {person && <PersonDetails key={person.id} person={person} />}
      </SheetContent>
    </Sheet>
  );
}

function PersonDetails({ person }: { person: Person }) {
  const repository = useRepository();
  const { roles, countries, teams, memberships } = useRepositoryState();
  const customRole = person.customRole;
  const customActive = customRole?.active === true;
  const setMode = (mode: string) => {
    if (mode === 'custom' && !customActive) {
      repository.updatePerson(person.id, { customRole: { label: '', costFactor: 1, dayRatesByYear: [], ...customRole, active: true } });
    } else if (mode === 'standard' && customRole && customActive) {
      repository.updatePerson(person.id, { customRole: { ...customRole, active: false } });
    }
  };

  const mine = memberships.filter((m) => m.personId === person.id && m.active);
  const teamIds = teams.map((t) => t.id);
  const claimed = claimedFtePct(person.id, memberships);
  const unclaimed = unclaimedCapacityPct(person, memberships);
  const joinable = teams.filter((t) => t.active && !memberships.some((m) => m.personId === person.id && m.teamId === t.id));
  const barPct = (pct: number) => `${Math.min(100, (pct / Math.max(person.capacityPct, 1)) * 100)}%`;

  return (
    <>
      <SheetHeader className="p-0 pr-6">
        <SheetTitle className="truncate text-base">{person.name}</SheetTitle>
        <SheetDescription className="sr-only">Person details</SheetDescription>
      </SheetHeader>

      <fieldset disabled={!person.active} className="m-0 min-w-0 border-0 p-0">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="person-name">Name</Label>
          <CommitInput
            id="person-name"
            value={person.name}
            onCommit={(text) => {
              const trimmed = text.trim();
              if (!trimmed || trimmed === person.name) return false;
              repository.updatePerson(person.id, { name: trimmed });
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="person-country">Country</Label>
          <Select value={person.countryId} onValueChange={(countryId) => repository.updatePerson(person.id, { countryId })}>
            <SelectTrigger id="person-country" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {countries
                .filter((c) => c.active || c.id === person.countryId)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={customActive ? undefined : 'person-role'}>Role</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Role type"
            value={customActive ? 'custom' : 'standard'}
            onValueChange={(mode) => mode && setMode(mode)}
          >
            <ToggleGroupItem value="standard" className="data-[state=on]:border-brand-accent data-[state=on]:bg-brand-accent-tint">
              Standard role
            </ToggleGroupItem>
            <ToggleGroupItem value="custom" className="data-[state=on]:border-brand-accent data-[state=on]:bg-brand-accent-tint">
              Custom role
            </ToggleGroupItem>
          </ToggleGroup>
          {customActive && customRole ? (
            <CustomRoleFields person={person} customRole={customRole} />
          ) : (
            <Select value={person.roleId} onValueChange={(roleId) => repository.updatePerson(person.id, { roleId })}>
              <SelectTrigger id="person-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles
                  .filter((r) => r.active || r.id === person.roleId)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="person-capacity">Capacity</Label>
          <PercentInput
            label="Capacity %"
            value={person.capacityPct}
            onChange={(capacityPct) => repository.updatePerson(person.id, { capacityPct })}
          />
        </div>
      </div>

      <section className="mt-4 border-t border-border-default pt-3" aria-label="Teams">
        <h3 className="m-0 mb-2 flex items-center gap-1.5 text-sm font-medium">
          <TeamsIcon width={16} height={16} />
          Teams
        </h3>
        <div
          className="flex h-2.5 overflow-hidden rounded-full border border-border-default bg-surface-subtle"
          role="img"
          aria-label={`${claimed}% of ${person.capacityPct}% claimed`}
        >
          {mine.map((m) => (
            <div key={m.id} className={teamColorClass(teamIds, m.teamId)} style={{ width: barPct(m.teamFtePct) }} />
          ))}
        </div>
        <p className="m-0 mt-1 mb-2 text-xs text-text-secondary">
          {claimed}% of {person.capacityPct}% claimed
        </p>

        {mine.map((m) => {
          const team = teams.find((t) => t.id === m.teamId);
          const max = unclaimedCapacityPct(person, memberships, m.id);
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-0 py-1">
              <span className={`size-2.5 shrink-0 rounded-full ${teamColorClass(teamIds, m.teamId)}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm">{team?.name ?? 'Unknown team'}</span>
              <PercentInput
                flat
                label={`Team FTE % for ${team?.name ?? 'team'}`}
                value={m.teamFtePct}
                max={max}
                onChange={(teamFtePct) => repository.updateMembership(m.id, { teamFtePct })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove from ${team?.name ?? 'team'}`}
                title="Remove from team"
                onClick={() => repository.removeMembership(m.id)}
              >
                <RemoveIcon />
              </Button>
            </div>
          );
        })}

        {unclaimed === 0 && mine.length > 0 && (
          <p className="m-0 mt-1 text-xs text-text-secondary">No capacity left to add to another team.</p>
        )}
        {joinable.length > 0 && unclaimed > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <PlusIcon width={16} height={16} className="text-text-secondary" />
            <Select value="" onValueChange={(teamId) => repository.addMembership(person.id, teamId)}>
              <SelectTrigger className="w-full" aria-label="Add to team">
                <SelectValue placeholder={`Add to team (${unclaimed}% free)`} />
              </SelectTrigger>
              <SelectContent>
                {joinable.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>
      </fieldset>

      <div className="mt-4 border-t border-border-default pt-3">
        {person.active ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => repository.updatePerson(person.id, { active: false })}>
            <DeactivateIcon />
            Deactivate person
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => repository.updatePerson(person.id, { active: true })}>
            <ReactivateIcon />
            Reactivate person
          </Button>
        )}
      </div>
    </>
  );
}
