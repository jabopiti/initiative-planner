import { useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { claimedFtePct } from '../data/capacity';
import { defaultCountryId, defaultRoleId, rememberPersonDefaults } from './personDefaults';
import { PercentInput } from './PercentInput';
import { DeactivateIcon, ReactivateIcon, RemoveIcon, WarningIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Team detail (§5.8), scoped to slice 004: the Members list only. */
export function TeamDetail({ id }: { id: string }) {
  const repository = useRepository();
  const { teams, people, memberships, roles, countries } = useRepositoryState();
  const [query, setQuery] = useState('');
  const team = teams.find((t) => t.id === id);

  if (!team) {
    return (
      <div className="px-8 py-6">
        <a href="#/teams">Back to Teams</a>
        <p className="text-text-secondary">That team doesn't exist.</p>
      </div>
    );
  }

  const members = memberships.filter((m) => m.teamId === team.id);
  const memberIds = new Set(members.map((m) => m.personId));
  const trimmed = query.trim();
  const matches = people.filter(
    (p) => p.active && !memberIds.has(p.id) && p.name.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const exact = people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());

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
      <h1 className="m-0 mt-1 mb-5 text-xl">{team.name}</h1>

      <section aria-label="Members" className="max-w-3xl">
        <h2 className="m-0 mb-3 text-base">Members</h2>

        <div className="relative mb-4 max-w-sm">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add member"
            aria-label="Add member"
            role="combobox"
            aria-expanded={trimmed.length > 0}
            aria-controls="add-member-options"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
            }}
          />
          {trimmed && (
            <ul
              id="add-member-options"
              role="listbox"
              className="absolute z-10 m-0 mt-1 w-full list-none rounded-md border border-border-default bg-surface-card p-1 shadow-md"
            >
              {matches.map((p) => {
                const held = claimedFtePct(p.id, memberships);
                return (
                  <li key={p.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer justify-between rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm hover:bg-surface-subtle"
                      onClick={() => addExisting(p.id)}
                    >
                      <span>{p.name}</span>
                      <span className="text-text-secondary">{Math.max(0, p.capacityPct - held)}% unclaimed</span>
                    </button>
                  </li>
                );
              })}
              {!exact && (
                <li role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-sm hover:bg-surface-subtle"
                    onClick={createInline}
                  >
                    Create “{trimmed}”
                  </button>
                </li>
              )}
              {matches.length === 0 && exact && (
                <li className="px-2 py-1.5 text-sm text-text-secondary">No one else to add.</li>
              )}
            </ul>
          )}
        </div>

        {members.length === 0 ? (
          <p className="m-0 py-6 text-[15px] text-text-secondary">No members yet. Add someone to start staffing initiatives.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-text-secondary">
                <th className="border-b border-border-default px-3 py-2 font-medium">Name</th>
                <th className="border-b border-border-default px-3 py-2 font-medium">Role</th>
                <th className="border-b border-border-default px-3 py-2 font-medium">Team FTE %</th>
                <th className="border-b border-border-default px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const person = people.find((p) => p.id === m.personId);
                if (!person) return null;
                const over = claimedFtePct(person.id, memberships) > person.capacityPct;
                return (
                  <tr key={m.id} className={`border-b border-border-default ${m.active && person.active ? '' : 'text-text-secondary'}`}>
                    <td className="px-3 py-2 font-medium">{person.name}</td>
                    <td className="px-3 py-2">{roles.find((r) => r.id === person.roleId)?.name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <PercentInput
                          label={`Team FTE % for ${person.name}`}
                          value={m.teamFtePct}
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
                    <td className="px-3 py-2 text-right whitespace-nowrap">
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
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
