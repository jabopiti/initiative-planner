import { Fragment, useMemo, useState } from 'react';
import { useFieldConflict } from '../state/ConflictUi';
import { useFieldFailure, useIsChangedByOthers, useRepository, useRepositoryState } from '../state/DataContext';
import { claimedFtePct, unclaimedCapacityPct } from '../data/capacity';
import { roleLabel } from '../data/roleLabel';
import { defaultCountryId, defaultRoleId, rememberPersonDefaults } from './personDefaults';
import { PercentInput } from './PercentInput';
import { ConflictRow, inRow } from './ConflictBlock';
import { CopyButton } from './CopyButton';
import { SortableHeader } from './SortableHeader';
import { CapacityGrid } from './CapacityGrid';
import { TeamInitiatives } from './TeamInitiatives';
import { PersonPanel } from './PersonPanel';
import { TruncatedText } from './TruncatedText';
import { sortRows } from '../data/sortRows';
import { useTableSort } from './tableSort';
import { DeactivateIcon, DeactivateTeamIcon, ReactivateIcon, ReactivateTeamIcon, RemoveIcon, WarningIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FILE_PATHS } from '../data/types';

/** Team detail (§5.8): the Members list, the Initiatives list and the Capacity view. */
export function TeamDetail({ id }: { id: string }) {
  const repository = useRepository();
  const changed = useIsChangedByOthers();
  const failure = useFieldFailure();
  const conflict = useFieldConflict();
  const { teams, people, memberships, roles, countries } = useRepositoryState();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [personId, setPersonId] = useState<string | null>(null);
  const sort = useTableSort('name');
  const team = teams.find((t) => t.id === id);

  const rows = useMemo(
    () =>
      memberships
        .filter((m) => m.teamId === id)
        .flatMap((m) => {
          const person = people.find((p) => p.id === m.personId);
          if (!person) return [];
          return [{ membership: m, person, roleName: roleLabel(person, roles) }];
        }),
    [memberships, people, roles, id],
  );
  const members = useMemo(
    () =>
      sortRows(
        rows,
        {
          name: (r) => r.person.name,
          role: (r) => r.roleName,
          fte: (r) => r.membership.teamFtePct,
        },
        sort.key,
        sort.dir,
        'name',
      ),
    [rows, sort.key, sort.dir],
  );

  if (!team) {
    return (
      <div className="px-8 py-6">
        <a href="#/teams">Back to Teams</a>
        <p className="text-text-secondary">That team doesn't exist.</p>
      </div>
    );
  }

  const memberIds = new Set(members.map((r) => r.person.id));
  const trimmed = query.trim();
  const matches = people.filter(
    (p) => p.active && !memberIds.has(p.id) && p.name.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const exact = people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());

  const listOpen = focused && trimmed.length > 0;
  // The list's options in order, for the arrow keys: the matching people, then Create (§9.5).
  const choices = [
    ...matches.map((p) => ({
      key: p.id,
      choose: () => addExisting(p.id),
      label: (
        <>
          <span>{p.name}</span>
          <span className="text-text-secondary">{unclaimedCapacityPct(p, memberships)}% unclaimed</span>
        </>
      ),
    })),
    ...(trimmed && !exact ? [{ key: 'create', choose: createInline, label: <>Create “{trimmed}”</> }] : []),
  ];
  // The list can shrink under the highlight when the data changes; past its end nothing is highlighted.
  const current = active < choices.length ? active : -1;

  function copyData() {
    // Status appears only when someone is inactive, so a plain roster stays three columns.
    const showStatus = members.some((r) => !r.membership.active || !r.person.active);
    return {
      headers: ['Name', 'Role', 'Team FTE %', ...(showStatus ? ['Status'] : [])],
      rows: members.map((r) => [
        r.person.name,
        r.roleName,
        `${r.membership.teamFtePct}%`,
        ...(showStatus ? [r.membership.active && r.person.active ? 'Active' : 'Inactive'] : []),
      ]),
      numericColumns: [2],
    };
  }

  function addExisting(personId: string) {
    repository.addMembership(personId, team!.id);
    setQuery('');
  }

  function createInline() {
    const countryId = defaultCountryId(countries);
    const roleId = defaultRoleId(roles);
    if (!trimmed || !countryId || !roleId) return;
    const person = repository.createPerson({ name: trimmed, countryId, roleId });
    rememberPersonDefaults(countryId, roleId);
    repository.addMembership(person.id, team!.id);
    setQuery('');
  }

  return (
    <div className="px-8 py-6">
      <a href="#/teams" className="text-sm text-text-secondary">
        Teams
      </a>
      <div className="mt-1 mb-5 flex items-center justify-between gap-4">
        <h1 className="m-0 flex items-center gap-2 text-xl">
          {team.name}
          {!team.active && <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-normal text-text-secondary">Inactive</span>}
        </h1>
        <Button type="button" variant="ghost" size="sm" onClick={() => repository.updateTeam(team.id, { active: !team.active })}>
          {team.active ? <DeactivateTeamIcon /> : <ReactivateTeamIcon />}
          {team.active ? 'Deactivate team' : 'Reactivate team'}
        </Button>
      </div>

      <section aria-label="Members" className="max-w-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 text-base">Members</h2>
          {members.length > 0 && <CopyButton getData={copyData} noun={['member', 'members']} />}
        </div>

        <div className="relative mb-4 max-w-sm">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setActive(-1);
            }}
            placeholder="Add member"
            aria-label="Add member"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls="add-member-options"
            aria-activedescendant={current >= 0 ? `add-member-option-${current}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                setActive(-1);
              } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && choices.length > 0) {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive(current < 0 ? (step === 1 ? 0 : choices.length - 1) : (current + step + choices.length) % choices.length);
              } else if (e.key === 'Enter' && current >= 0) {
                e.preventDefault();
                choices[current].choose();
                setActive(-1);
              }
            }}
          />
          {listOpen && (
            <ul
              id="add-member-options"
              role="listbox"
              aria-label="People to add"
              className="absolute z-10 m-0 mt-1 w-full list-none rounded-md border border-border-default bg-surface-card p-1 shadow-md"
            >
              {choices.map((choice, i) => (
                <li
                  key={choice.key}
                  id={`add-member-option-${i}`}
                  role="option"
                  aria-selected={i === current}
                  className={`flex w-full cursor-pointer justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-subtle ${i === current ? 'bg-surface-subtle outline-2 outline-accent' : ''}`}
                  // Keep focus in the field, so a click chooses without blurring the list away first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={choice.choose}
                >
                  {choice.label}
                </li>
              ))}
              {matches.length === 0 && exact && (
                <li className="px-2 py-1.5 text-sm text-text-secondary">No one else to add.</li>
              )}
            </ul>
          )}
        </div>

        {members.length === 0 ? (
          <p className="m-0 py-6 text-body-lg text-text-secondary">No members yet. Add someone to start staffing initiatives.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-text-secondary">
                <SortableHeader label="Name" sortKey="name" sort={sort} />
                <SortableHeader label="Role" sortKey="role" sort={sort} />
                <SortableHeader label="Team FTE %" sortKey="fte" sort={sort} />
                <th className="border-b border-border-default px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map(({ membership: m, person, roleName }) => {
                const over = claimedFtePct(person.id, memberships) > person.capacityPct;
                const fteConflict = conflict(FILE_PATHS.memberships, [{ id: m.id }, 'teamFtePct']);
                return (
                  <Fragment key={m.id}>
                  <tr
                    className={`cursor-pointer border-b border-border-default ${m.active && person.active ? '' : 'text-text-secondary'}`}
                    onClick={(e) => {
                      // Editing the FTE or using the row actions must not open the drawer.
                      if (!(e.target as HTMLElement).closest('input, [data-row-action]')) setPersonId(person.id);
                    }}
                  >
                    <td className="px-3 py-2 font-medium">
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-inherit"
                        onClick={() => setPersonId(person.id)}
                      >
                        <TruncatedText text={person.name} />
                      </button>
                    </td>
                    <td className="px-3 py-2">{roleName}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <PercentInput
                          changed={changed(FILE_PATHS.memberships, [{ id: m.id }, 'teamFtePct'])}
                          failure={failure(FILE_PATHS.memberships, [{ id: m.id }, 'teamFtePct'])}
                          conflict={inRow(fteConflict)}
                          label={`Team FTE % for ${person.name}`}
                          value={m.teamFtePct}
                          disabled={!m.active || !person.active}
                          onChange={(teamFtePct) => repository.updateMembership(m.id, { teamFtePct }, true)}
                        />
                        {over && (
                          <span
                            className="text-warning-text"
                            role="img"
                            aria-label={`${person.name}'s Team FTE % add up to more than their ${person.capacityPct}% capacity`}
                            title={`Team FTE %s add up to more than ${person.capacityPct}% capacity`}
                          >
                            <WarningIcon width={16} height={16} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" data-row-action>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${m.active ? 'Deactivate' : 'Reactivate'} ${person.name} in this team`}
                        title={m.active ? 'Deactivate' : 'Reactivate'}
                        onClick={() => repository.updateMembership(m.id, { active: !m.active }, true)}
                      >
                        {m.active ? <DeactivateIcon /> : <ReactivateIcon />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${person.name} from this team`}
                        title="Remove from team"
                        onClick={() => repository.removeMembership(m.id)}
                      >
                        <RemoveIcon />
                      </Button>
                    </td>
                  </tr>
                  <ConflictRow conflict={fteConflict} label={`Team FTE % for ${person.name}`} colSpan={4} />
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <TeamInitiatives team={team} />
      <CapacityGrid team={team} />
      <PersonPanel person={people.find((p) => p.id === personId) ?? null} onClose={() => setPersonId(null)} />
    </div>
  );
}
