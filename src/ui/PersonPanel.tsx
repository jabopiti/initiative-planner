import { useRef, useState } from 'react';
import { useFieldConflict } from '../state/ConflictUi';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { claimedFtePct, unclaimedCapacityPct } from '../data/capacity';
import { joinableTeams } from '../data/teamMembers';
import type { Person } from '../data/types';
import { FILE_PATHS } from '../data/types';
import { removeMembershipWithUndo } from './undoToast';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeactivateIcon, PlusIcon, ReactivateIcon, RemoveFromTeamIcon, TeamsIcon } from './icons';
import { RowActionsMenu } from './RowActionsMenu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { focusRing } from '@/components/ui/focus-ring';
import { SplitBar } from './SplitBar';
import { CommitInput } from './CommitInput';
import { CustomRoleFields } from './CustomRoleFields';
import { PercentInput } from './PercentInput';
import { useTeamColors } from './teamColors';
import { TeamSwatch } from './TeamSwatch';

/** Person detail drawer (§5.6), shared by every view that opens a person. Carries no warnings and no allocation list. */
export function PersonPanel({ person, onClose }: { person: Person | null; onClose: () => void }) {
  // The drawer has no trigger element, so hand focus back to whatever opened it (§5.6).
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  return (
    <Sheet open={person !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        ref={content}
        className="w-96 overflow-y-auto p-4"
        onOpenAutoFocus={(e) => {
          opener.current = document.activeElement as HTMLElement | null;
          // Land on the heading, not the Name field: a stray key press must not replace the name (§5.6).
          e.preventDefault();
          content.current?.querySelector<HTMLElement>('[data-slot="sheet-title"]')?.focus();
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
  const changed = useIsChangedByOthers();
  const failure = useFieldFailure();
  const fieldConflict = useFieldConflict();
  // An inactive person's fields are disabled, the choices with them: the banner resolves their conflicts (§9.9).
  const conflict = person.active ? fieldConflict : () => null;
  const { roles, countries, teams, memberships } = useRepositoryState();
  const teamColor = useTeamColors();
  const [rejoinCap, setRejoinCap] = useState<{ id: string; pct: number } | null>(null);
  /** The membership whose legend chip has its popover open. */
  const [openChip, setOpenChip] = useState<string | null>(null);
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
  const claimed = claimedFtePct(person.id, memberships);
  const unclaimed = unclaimedCapacityPct(person, memberships);
  const joinable = joinableTeams(person.id, teams, memberships);
  /** Joining a team; a membership that was inactive comes back (§5.6), and the note says if it came back smaller. */
  const join = (teamId: string) => {
    const before = memberships.find((m) => m.personId === person.id && m.teamId === teamId);
    const joined = repository.addMembership(person.id, teamId);
    if (before && joined && joined.teamFtePct < before.teamFtePct) {
      setRejoinCap({ id: joined.id, pct: joined.teamFtePct });
      // The cap note is in the team's popover, so it opens to show it.
      setOpenChip(joined.id);
    }
  };
  const teamName = (teamId: string) => teams.find((t) => t.id === teamId)?.name ?? 'Unknown team';
  const fteField = (m: (typeof mine)[number]) => ({
    changed: changed(FILE_PATHS.memberships, [{ id: m.id }, 'teamFtePct']),
    failure: failure(FILE_PATHS.memberships, [{ id: m.id }, 'teamFtePct']),
    conflict: conflict(FILE_PATHS.memberships, [{ id: m.id }, 'teamFtePct']),
  });
  // Team FTE %s over Capacity % (raised on the team detail) don't fit one bar, so each team gets a field (§5.6); so
  // does an unsaved or conflicting value, which stays in its field until it is resolved (§9.9).
  const asRows = claimed > person.capacityPct || mine.some((m) => fteField(m).failure || fteField(m).conflict);
  const move = (changes: { id: string; pct: number }[]) => {
    if (changes.length === 1) repository.updateMembership(changes[0].id, { teamFtePct: changes[0].pct });
    else repository.setTeamFteSplit(changes.map((c) => ({ id: c.id, teamFtePct: c.pct })));
  };

  return (
    <>
      <SheetHeader className="p-0 pr-6">
        <SheetTitle tabIndex={-1} className="truncate text-body outline-none">{person.name}</SheetTitle>
        <SheetDescription className="sr-only">Person details</SheetDescription>
      </SheetHeader>

      <fieldset disabled={!person.active} className="m-0 min-w-0 border-0 p-0">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="person-name">Name</Label>
          <CommitInput
            id="person-name"
            changed={changed(FILE_PATHS.people, [{ id: person.id }, 'name'])}
            failure={failure(FILE_PATHS.people, [{ id: person.id }, 'name'])}
            conflict={conflict(FILE_PATHS.people, [{ id: person.id }, 'name'])}
            conflictLabel="Name"
            retryLabel="Retry saving Name"
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
            id="person-capacity"
            label="Capacity %"
            changed={changed(FILE_PATHS.people, [{ id: person.id }, 'capacityPct'])}
            failure={failure(FILE_PATHS.people, [{ id: person.id }, 'capacityPct'])}
            conflict={conflict(FILE_PATHS.people, [{ id: person.id }, 'capacityPct'])}
            value={person.capacityPct}
            onChange={(capacityPct) => repository.updatePerson(person.id, { capacityPct })}
          />
        </div>
      </div>

      <section className="mt-4 border-t border-border-default pt-3" aria-label="Teams">
        <h3 className="m-0 mb-2 flex items-center gap-1.5 text-heading">
          <TeamsIcon width={16} height={16} />
          Teams
        </h3>
        {asRows ? (
          <>
            <p className="m-0 mb-2 text-caption text-text-secondary">
              {claimed}% of {person.capacityPct}% claimed
            </p>
            {mine.map((m) => {
              const name = teamName(m.teamId);
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-0 py-1">
                  <TeamSwatch teamId={m.teamId} />
                  <span className="min-w-0 flex-1 truncate text-body">{name}</span>
                  <PercentInput
                    flat
                    {...fteField(m)}
                    label={`Team FTE % for ${name}`}
                    value={m.teamFtePct}
                    max={unclaimedCapacityPct(person, memberships, m.id)}
                    initialCappedAt={rejoinCap?.id === m.id ? rejoinCap.pct : null}
                    onChange={(teamFtePct) => repository.updateMembership(m.id, { teamFtePct })}
                  />
                  <RowActionsMenu
                    label={`Actions for ${name}`}
                    actions={[{ label: 'Remove from team', icon: RemoveFromTeamIcon, onSelect: () => removeMembershipWithUndo(repository, m.id) }]}
                  />
                </div>
              );
            })}
          </>
        ) : (
          <>
            <SplitBar
              segments={mine.map((m) => ({ id: m.id, name: teamName(m.teamId), pct: m.teamFtePct, colorClass: teamColor(m.teamId) }))}
              capacityPct={person.capacityPct}
              disabled={!person.active}
              onMove={move}
            />
            <p className="m-0 mt-1 mb-2 text-caption text-text-secondary">
              {claimed}% of {person.capacityPct}% claimed
            </p>
            {mine.length > 0 && (
              <ul className="m-0 mb-1 flex list-none flex-wrap gap-1.5 p-0" aria-label="Team FTE %s">
                {mine.map((m) => {
                  const name = teamName(m.teamId);
                  return (
                    <li key={m.id}>
                      <Popover open={openChip === m.id} onOpenChange={(open) => setOpenChip(open ? m.id : null)}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-input bg-surface-card py-0.5 pr-2.5 pl-2 text-caption text-text-primary tabular-nums hover:bg-surface-subtle disabled:cursor-default disabled:hover:bg-surface-card data-[state=open]:border-brand-accent ${focusRing}`}
                          >
                            <TeamSwatch teamId={m.teamId} />
                            {name} {m.teamFtePct}%
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 p-3" aria-label={name}>
                          <p className="m-0 mb-2 flex items-center gap-1.5 text-body font-medium">
                            <TeamSwatch teamId={m.teamId} />
                            {name}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2">
                            <Label htmlFor={`team-fte-${m.id}`} className="flex-1 font-normal text-text-secondary">
                              Team FTE %
                            </Label>
                            <PercentInput
                              flat
                              id={`team-fte-${m.id}`}
                              {...fteField(m)}
                              label={`Team FTE % for ${name}`}
                              value={m.teamFtePct}
                              max={unclaimedCapacityPct(person, memberships, m.id)}
                              initialCappedAt={rejoinCap?.id === m.id ? rejoinCap.pct : null}
                              onChange={(teamFtePct) => repository.updateMembership(m.id, { teamFtePct })}
                            />
                          </div>
                          <div className="mt-2 border-t border-border-default pt-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setOpenChip(null);
                                removeMembershipWithUndo(repository, m.id);
                              }}
                            >
                              <RemoveFromTeamIcon />
                              Remove from team
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {unclaimed === 0 && mine.length > 0 && (
          <p className="m-0 mt-1 text-caption text-text-secondary">No capacity left to add to another team.</p>
        )}
        {joinable.length > 0 && unclaimed > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <PlusIcon width={16} height={16} className="text-text-secondary" />
            <Select value="" onValueChange={join}>
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
