import { trackedYears } from '../data/cost';
import { formatMonthEn, monthKey } from '../data/dates';
import { newId } from '../data/ids';
import { newCountryRates, weekdaysByMonth } from '../data/rates';
import { unclaimedCapacityPct } from '../data/capacity';
import type { Country, CountryYearRateRecord, Membership, Person, Role, Team } from '../data/types';
import type { CommitNote } from './FileWriter';
import type { RepositoryState } from './Repository';
import { countryWords, membershipWords, note, personName, personWords, roleWords, teamName, teamWords } from './commitWords';
import { insertAt } from './insertAt';
import { sameValue } from './merge';

export interface NewPersonInput {
  name: string;
  countryId: string;
  roleId: string;
}

/** What the reference-data commands need of the repository they edit: its state and the one place each file is written. */
export interface ReferenceDataHost {
  getState: () => RepositoryState;
  commitRoles: (next: Role[], note?: CommitNote) => void;
  commitCountries: (next: Country[], note?: CommitNote) => void;
  commitTeams: (next: Team[], note?: CommitNote) => void;
  commitPeople: (next: Person[], note?: CommitNote) => void;
  commitMemberships: (next: Membership[], note?: CommitNote | CommitNote[]) => void;
  /** Runs an action that may write several files, as one commit (§10.3). */
  jointly: (action: () => void) => void;
  /** Marks the rates reviewed (§5.2) unless they already are. */
  markRatesReviewed: (words: string) => void;
  /** An amount as a commit message reads it, in the deployment's currency (§9.7). */
  money: (amount: number) => string;
}

/**
 * The edits to roles, countries, teams, people and memberships (§5.5–§5.9): each reads the dataset on screen, makes the
 * change and hands it to the host to put on screen and save, with a note for its commit message (§10.3).
 */
export class ReferenceDataCommands {
  constructor(private readonly host: ReferenceDataHost) {}

  private get state(): RepositoryState {
    return this.host.getState();
  }

  /** New role (§5.9): created from a name, abbreviation and cost factor, active. */
  createRole(input: { name: string; abbreviation: string; costFactor: number }): Role {
    const role: Role = { id: newId(), ...input, active: true };
    this.host.commitRoles([...this.state.roles, role], note('role', role.id, 'record', undefined, role, roleWords));
    return role;
  }

  /** In-place edit from the Roles table (§5.9): name, abbreviation, cost factor, or deactivate/reactivate; roles are never deleted (§9.3). */
  updateRole(id: string, patch: Partial<Omit<Role, 'id'>>): void {
    const current = this.state.roles.find((r) => r.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if ((Object.keys(patch) as (keyof typeof patch)[]).every((key) => next[key] === current[key])) return;
    this.host.commitRoles(
      this.state.roles.map((r) => (r.id === id ? next : r)),
      note('role', id, 'record', current, next, roleWords),
    );
  }

  /** New country (§5.9): its one day rate copied to every tracked year, working days prefilled with weekdays. */
  createCountry(input: { name: string; code: string; dayRate: number }, today: Date): Country {
    const country: Country = { id: newId(), name: input.name, code: input.code, active: true, ratesByYear: newCountryRates(input.dayRate, trackedYears(today)) };
    this.host.commitCountries([...this.state.countries, country], note('country', country.id, 'record', undefined, country, countryWords));
    return country;
  }

  /** Rename, recode, deactivate or reactivate a country; countries are never deleted (§9.3). */
  updateCountry(id: string, patch: Partial<Pick<Country, 'name' | 'code' | 'active'>>): void {
    const current = this.state.countries.find((c) => c.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (next.name === current.name && next.code === current.code && next.active === current.active) return;
    this.host.commitCountries(
      this.state.countries.map((c) => (c.id === id ? next : c)),
      note('country', id, 'record', current, next, countryWords),
    );
  }

  /** A country's day rate for one year (§5.9, §7.2). Any rate edit also marks the rates reviewed (§5.2). */
  setCountryDayRate(id: string, year: number, dayRate: number): void {
    this.editYear(id, year, `dayRate:${year}`, (r) => r.dayRate, (r) => ({ ...r, dayRate }), (name, to) => `${name}: ${year} day rate set to ${this.host.money(to as number)}`);
  }

  /** One month's working days for one year of a country (`month` 0-based). */
  setCountryWorkingDays(id: string, year: number, month: number, days: number): void {
    const key = monthKey(year, month);
    this.editYear(
      id,
      year,
      `workingDays:${key}`,
      (r) => r.workingDaysByMonth[month],
      (r) => ({ ...r, workingDaysByMonth: r.workingDaysByMonth.map((d, i) => (i === month ? days : d)) }),
      (name, to) => `${name}: working days in ${formatMonthEn(key)} set to ${to}`,
    );
  }

  /** Reset to weekdays: all twelve months of one year back to their weekday counts. */
  resetCountryWorkingDays(id: string, year: number): void {
    this.editYear(
      id,
      year,
      `workingDays:${year}`,
      (r) => r.workingDaysByMonth,
      (r) => ({ ...r, workingDaysByMonth: weekdaysByMonth(year) }),
      (name) => `${name}: working days in ${year} reset to weekdays`,
    );
  }

  /**
   * One year entry of one country: `set` makes the edit, `get` reads the value the commit note names (§10.3),
   * and `words` phrases it with the country's name. No write when that value is unchanged.
   */
  private editYear(
    id: string,
    year: number,
    field: string,
    get: (record: CountryYearRateRecord) => unknown,
    set: (record: CountryYearRateRecord) => CountryYearRateRecord,
    words: (name: string, to: unknown) => string,
  ): void {
    const country = this.state.countries.find((c) => c.id === id);
    const record = country?.ratesByYear.find((r) => r.year === year);
    if (!country || !record) return;
    const next = set(record);
    if (sameValue(get(next), get(record))) return;
    const updated = { ...country, ratesByYear: country.ratesByYear.map((r) => (r.year === year ? next : r)) };
    // The first rate edit also marks the rates reviewed: both files in one commit (§10.3).
    this.host.jointly(() => {
      this.host.commitCountries(
        this.state.countries.map((c) => (c.id === id ? updated : c)),
        note('country', id, field, get(record), get(next), (_, to) => words(country.name, to)),
      );
      this.host.markRatesReviewed('Rates marked as reviewed');
    });
  }

  /** Rates are correct (§5.9): confirms the rates without editing them, which clears Review rates (§5.2). */
  confirmRates(): void {
    this.host.markRatesReviewed('Rates confirmed as correct');
  }

  /** Why a team name is refused (§5.8): empty, or another team already has it (case-insensitive). */
  teamNameRefusal(name: string, exceptId?: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return 'Enter a name.';
    const taken = this.state.teams.find((t) => t.id !== exceptId && t.name.trim().toLowerCase() === trimmed.toLowerCase());
    return taken ? `A team named ${taken.name} already exists.` : null;
  }

  /** New team (§5.7): created from a name only. Callers ask `teamNameRefusal` first; a refused name here is a bug. */
  createTeam(name: string): Team {
    const refusal = this.teamNameRefusal(name);
    if (refusal) throw new Error(refusal);
    const team: Team = { id: newId(), name: name.trim(), active: true };
    this.host.commitTeams([...this.state.teams, team], note('team', team.id, 'record', undefined, team, teamWords));
    return team;
  }

  /** A new person added straight to a team (§5.8): the person and the membership in one commit (§10.3). */
  createPersonInTeam(input: NewPersonInput, teamId: string): Person {
    let person!: Person;
    this.host.jointly(() => {
      person = this.createPerson(input);
      this.addMembership(person.id, teamId);
    });
    return person;
  }

  /** New person (§5.5): Capacity % defaults to 100, active. */
  createPerson(input: NewPersonInput): Person {
    const person: Person = {
      id: newId(),
      name: input.name,
      countryId: input.countryId,
      roleId: input.roleId,
      capacityPct: 100,
      active: true,
    };
    this.host.commitPeople([...this.state.people, person], note('person', person.id, 'record', undefined, person, this.personWords()));
    return person;
  }

  /** Rename, deactivate or reactivate a team (§5.8, §9.3): teams are never deleted, so the record stays. */
  updateTeam(id: string, patch: Partial<Pick<Team, 'name' | 'active'>>): void {
    const current = this.state.teams.find((t) => t.id === id);
    if (!current) return;
    if (patch.name !== undefined && this.teamNameRefusal(patch.name, id)) return;
    const next = { ...current, ...patch, ...(patch.name !== undefined && { name: patch.name.trim() }) };
    if (next.name === current.name && next.active === current.active) return;
    this.host.commitTeams(
      this.state.teams.map((t) => (t.id === id ? next : t)),
      note('team', id, 'record', current, next, teamWords),
    );
  }

  /** In-place edit from the person panel (§5.6): no save button, so every change commits. */
  updatePerson(id: string, patch: Partial<Omit<Person, 'id'>>): void {
    const current = this.state.people.find((p) => p.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.host.commitPeople(
      this.state.people.map((p) => (p.id === id ? next : p)),
      note('person', id, 'record', current, next, this.personWords()),
    );
  }

  /**
   * Add a person to a team (§5.6, §5.8). Team FTE % defaults to the person's
   * unclaimed capacity; a requested value is capped at it unless `allowOver`
   * (the team detail, where the over-capacity warning is visible).
   */
  addMembership(personId: string, teamId: string, requestedPct?: number, allowOver = false): Membership | null {
    const person = this.state.people.find((p) => p.id === personId);
    if (!person) return null;
    const existing = this.state.memberships.find((m) => m.personId === personId && m.teamId === teamId);
    if (existing?.active) return existing;
    if (existing) {
      // Rejoining (§5.6): the same record comes back, keeping its Team FTE % unless the person no longer has room.
      this.updateMembership(existing.id, { active: true, teamFtePct: existing.teamFtePct });
      return this.state.memberships.find((m) => m.id === existing.id) ?? null;
    }
    const unclaimed = unclaimedCapacityPct(person, this.state.memberships);
    const teamFtePct = requestedPct === undefined ? unclaimed : allowOver ? requestedPct : Math.min(requestedPct, unclaimed);
    const membership: Membership = { id: newId(), personId, teamId, teamFtePct, active: true };
    this.host.commitMemberships([...this.state.memberships, membership], this.membershipNote(membership.id, undefined, membership));
    return membership;
  }

  /** Edit a membership's Team FTE %; `allowOver` is set only by the team detail (§5.6). */
  updateMembership(id: string, patch: Partial<Pick<Membership, 'teamFtePct' | 'active'>>, allowOver = false): void {
    this.updateMemberships([{ id, ...patch }], allowOver);
  }

  /**
   * Edit several memberships as one edit, a note each (§10.3): a split bar divider moves Team FTE % from one team to
   * the next (§5.6). Unless `allowOver`, each Team FTE % is capped at what the person has unclaimed; lowered values go
   * first, so the room they free counts for the raised ones.
   */
  updateMemberships(changes: ({ id: string } & Partial<Pick<Membership, 'teamFtePct' | 'active'>>)[], allowOver = false): void {
    const before = new Map(this.state.memberships.map((m) => [m.id, m]));
    const rise = (c: (typeof changes)[number]) => (c.teamFtePct ?? 0) - (before.get(c.id)?.teamFtePct ?? 0);
    let next = this.state.memberships;
    for (const { id, ...patch } of [...changes].sort((x, y) => rise(x) - rise(y))) {
      next = next.map((m) => {
        if (m.id !== id) return m;
        const person = this.state.people.find((p) => p.id === m.personId);
        const capped = patch.teamFtePct === undefined || allowOver || !person ? patch : { ...patch, teamFtePct: Math.min(patch.teamFtePct, unclaimedCapacityPct(person, next, id)) };
        return { ...m, ...capped };
      });
    }
    const notes = this.state.memberships.flatMap((m, i) => (next[i] !== m ? [this.membershipNote(m.id, m, next[i])] : []));
    if (notes.length > 0) this.host.commitMemberships(next, notes);
  }

  /** A membership's note; the person and team are named as they are now, since a removal leaves no record to ask. */
  private membershipNote(id: string, from: Membership | undefined, to: Membership | undefined): CommitNote {
    const of = (m: Membership | undefined) => (m ? { who: personName(this.state, m.personId), where: teamName(this.state, m.teamId) } : undefined);
    const names = of(from ?? to) as { who: string; where: string };
    return { ...note('membership', id, 'record', from, to, membershipWords(names.where)), subject: names.who };
  }

  private personWords() {
    return personWords({
      countryName: (id) => this.state.countries.find((c) => c.id === id)?.name,
      roleName: (id) => this.state.roles.find((r) => r.id === id)?.name,
    });
  }

  /** Memberships are removable (§9.3); nothing points at them. The record and position come back for an Undo (§5.11). */
  removeMembership(id: string): { membership: Membership; index: number } | null {
    const index = this.state.memberships.findIndex((m) => m.id === id);
    if (index < 0) return null;
    const membership = this.state.memberships[index];
    this.host.commitMemberships(
      this.state.memberships.filter((m) => m.id !== id),
      this.membershipNote(id, membership, undefined),
    );
    return { membership, index };
  }

  /** Undo of {@link removeMembership}: the same record back in its place, or why it can't be (§5.11). */
  restoreMembership(membership: Membership, index: number): { ok: true } | { ok: false; message: string } {
    const person = this.state.people.find((p) => p.id === membership.personId);
    const team = this.state.teams.find((t) => t.id === membership.teamId);
    if (!person || !team) return { ok: false, message: "Can't undo: the person or team is no longer there." };
    if (this.state.memberships.some((m) => m.id === membership.id || (m.personId === membership.personId && m.teamId === membership.teamId))) {
      return { ok: false, message: `Can't undo: ${person.name} is on ${team.name} again.` };
    }
    this.host.commitMemberships(insertAt(this.state.memberships, membership, index), this.membershipNote(membership.id, undefined, membership));
    return { ok: true };
  }
}
