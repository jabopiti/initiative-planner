import { useEffect, useMemo, useRef, useState } from 'react';
import { useRepository, useRepositoryState } from '../state/DataContext';
import { defaultCountryId, defaultRoleId, rememberPersonDefaults } from './personDefaults';
import { PersonPanel } from './PersonPanel';
import { EmptyState } from './EmptyState';
import { CopyButton } from './CopyButton';
import { SortableHeader } from './SortableHeader';
import { TruncatedText } from './TruncatedText';
import { sortRows, useTableSort } from './tableSort';
import { DeactivateIcon, PlusIcon, ReactivateIcon } from './icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type StatusFilter = 'active' | 'inactive' | 'all';

/** People overview (§5.5): quick-add row, table (active by default) and the person side panel. */
export function PeopleOverview() {
  const repository = useRepository();
  const { people, roles, countries, teams, memberships } = useRepositoryState();
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [countryId, setCountryId] = useState(() => defaultCountryId(countries));
  const [roleId, setRoleId] = useState(() => defaultRoleId(roles));

  const nameInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  function focusRow(id: string) {
    requestAnimationFrame(() => rowRefs.current.get(id)?.focus());
  }
  const effectiveCountry = countries.some((c) => c.id === countryId && c.active) ? countryId : defaultCountryId(countries);
  const effectiveRole = roles.some((r) => r.id === roleId && r.active) ? roleId : defaultRoleId(roles);

  const sort = useTableSort('name');

  const rows = useMemo(() => {
    const teamNamesOf = (personId: string) =>
      memberships
        .filter((m) => m.personId === personId && m.active)
        .map((m) => teams.find((t) => t.id === m.teamId)?.name)
        .filter(Boolean)
        .join(', ');
    return people
      .filter((p) => filter === 'all' || (filter === 'active' ? p.active : !p.active))
      .map((p) => ({
        person: p,
        roleName: roles.find((r) => r.id === p.roleId)?.name ?? '—',
        countryName: countries.find((c) => c.id === p.countryId)?.name ?? '—',
        teamNames: teamNamesOf(p.id),
      }));
  }, [people, filter, roles, countries, teams, memberships]);

  const visible = useMemo(
    () =>
      sortRows(
        rows,
        {
          name: (r) => r.person.name,
          role: (r) => r.roleName,
          country: (r) => r.countryName,
          teams: (r) => r.teamNames,
          capacity: (r) => r.person.capacityPct,
          status: (r) => (r.person.active ? 0 : 1),
        },
        sort.key,
        sort.dir,
        'name',
      ),
    [rows, sort.key, sort.dir],
  );

  function copyData() {
    return {
      headers: ['Name', 'Role', 'Country', 'Team(s)', 'Capacity', 'Status'],
      rows: visible.map((r) => [
        r.person.name,
        r.roleName,
        r.countryName,
        r.teamNames || '—',
        `${r.person.capacityPct}%`,
        r.person.active ? 'Active' : 'Inactive',
      ]),
    };
  }
  const selected = people.find((p) => p.id === selectedId) ?? null;

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !effectiveCountry || !effectiveRole) return;
    repository.createPerson({ name: name.trim(), countryId: effectiveCountry, roleId: effectiveRole });
    rememberPersonDefaults(effectiveCountry, effectiveRole);
    setName('');
    nameInputRef.current?.focus();
  }

  function closePanel() {
    const id = selectedId;
    setSelectedId(null);
    if (id) focusRow(id);
  }

  // Esc closes the panel wherever focus is (§5.6), including back on the row that opened it.
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelectedId(null);
      focusRow(selectedId);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  return (
    <div className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="m-0 text-xl">People</h1>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <SelectTrigger aria-label="Show people">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          {visible.length > 0 && <CopyButton getData={copyData} noun={['person', 'people']} />}
        </div>
      </div>

      <form
        className="mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-border-default bg-surface-card p-3"
        onSubmit={handleAdd}
        aria-label="Add a person"
      >
        <Input
          ref={nameInputRef}
          className="w-56"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a person by name"
          aria-label="Name"
        />
        <Select value={effectiveCountry} onValueChange={setCountryId}>
          <SelectTrigger aria-label="Country">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {countries
              .filter((c) => c.active)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={effectiveRole} onValueChange={setRoleId}>
          <SelectTrigger aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles
              .filter((r) => r.active)
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!name.trim()}>
          <PlusIcon />
          Add person
        </Button>
      </form>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {people.length === 0 ? (
            <p className="m-0 px-4 py-10 text-center text-[15px] text-text-secondary">
              No people yet. Type a name above to add the first one.
            </p>
          ) : visible.length === 0 ? (
            <EmptyState
              line={filter === 'inactive' ? 'No inactive people' : 'No active people'}
              actionLabel="Show all"
              onAction={() => setFilter('all')}
            />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-text-secondary">
                  <SortableHeader label="Name" sortKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                  <SortableHeader label="Role" sortKey="role" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                  <SortableHeader label="Country" sortKey="country" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                  <SortableHeader label="Team(s)" sortKey="teams" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                  <SortableHeader label="Capacity" sortKey="capacity" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                  <SortableHeader label="Status" sortKey="status" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                  <th className="border-b border-border-default px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ person: p, roleName, countryName, teamNames }) => {
                  return (
                    <tr
                      key={p.id}
                      className={`cursor-pointer border-b border-border-default ${p.id === selectedId ? 'bg-brand-accent-tint' : ''} ${p.active ? '' : 'text-text-secondary'}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <td className="px-3 py-2">
                        <button
                          ref={(el) => {
                            if (el) rowRefs.current.set(p.id, el);
                            else rowRefs.current.delete(p.id);
                          }}
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-inherit"
                          onClick={() => setSelectedId(p.id)}
                        >
                          <TruncatedText text={p.name} />
                        </button>
                      </td>
                      <td className="px-3 py-2">{roleName}</td>
                      <td className="px-3 py-2">{countryName}</td>
                      <td className="px-3 py-2">{teamNames || '—'}</td>
                      <td className="px-3 py-2 text-right">{p.capacityPct}%</td>
                      <td className="px-3 py-2">{p.active ? 'Active' : 'Inactive'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${p.active ? 'Deactivate' : 'Reactivate'} ${p.name}`}
                          title={p.active ? 'Deactivate' : 'Reactivate'}
                          onClick={(e) => {
                            e.stopPropagation();
                            repository.updatePerson(p.id, { active: !p.active });
                          }}
                        >
                          {p.active ? <DeactivateIcon /> : <ReactivateIcon />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {selected && <PersonPanel key={selected.id} person={selected} onClose={closePanel} />}
      </div>
    </div>
  );
}
