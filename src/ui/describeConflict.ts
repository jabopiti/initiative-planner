import type { PhaseDef } from '../brand/types';
import { formatDateField } from '../data/dates';
import type { Country, CustomRoleYearRate, Initiative, Membership, Person, Role, Team } from '../data/types';
import { getAtPath, type MergeConflict, type Path } from '../sync/merge';
import { formatAmount } from './formatAmount';

/** What a conflict row needs to name things as the screen does. */
export interface ConflictContext {
  process: PhaseDef[];
  currencySymbol: string;
  initiatives: Initiative[];
  people: Person[];
  teams: Team[];
  memberships: Membership[];
  roles: Role[];
  countries: Country[];
}

/** A conflict in words (§3, §9.9): "Payments API · Validation end date — yours 30.11.2026, theirs 15.12.2026". */
export interface ConflictDescription {
  entity: string;
  field: string;
  mine: string;
  theirs: string;
  /** False when no label covers the field: the row names its raw key instead. */
  labelled: boolean;
}

interface Field {
  label: string;
  format: (value: unknown) => string;
  /** How an absent value reads: an unset field is "not set", a list item that is gone is "removed". */
  unset?: string;
}

const text = (value: unknown) => String(value);
const percent = (value: unknown) => `${String(value)}%`;
const status = (value: unknown) => (value ? 'Active' : 'Inactive');
const nameIn = (list: { id: string; name: string }[]) => (id: unknown) => list.find((x) => x.id === id)?.name ?? String(id);
const date = (value: unknown) => formatDateField(String(value));

/** Anything a label does not cover: plain values as they are, never raw JSON. */
function fallbackValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  if (typeof value === 'object' && value !== null) return 'set';
  return String(value);
}

function initiativeField(rest: Path, doc: Initiative | undefined, conflict: MergeConflict, ctx: ConflictContext): Field | null {
  const [head, phaseId, part, item, leaf] = rest;
  switch (head) {
    case 'name':
      return { label: 'Name', format: text };
    case 'description':
      return { label: 'Description', format: text };
    case 'ownerId':
      return { label: 'Owner', format: nameIn(ctx.people) };
    case 'teamId':
      return { label: 'Team', format: nameIn(ctx.teams) };
    case 'status':
      return { label: 'Status', format: text };
    case 'defaultPlan':
      return { label: 'Suggested periods', format: () => 'Yes', unset: 'No' };
  }
  if (head !== 'phases' || typeof phaseId !== 'string' || rest.length < 3) return null;
  const phase = ctx.process.find((p) => p.id === phaseId)?.label ?? phaseId;
  if (rest.length === 3 && part === 'startDate') return { label: `${phase} start date`, format: date };
  if (rest.length === 3 && part === 'endDate') return { label: `${phase} end date`, format: date };
  if (part !== 'allocations' || typeof item !== 'object' || rest.length > 5) return null;

  // The item on screen, or, when one side removed it, whichever side still has it.
  const allocation = (getAtPath(doc, rest.slice(0, 4)) ?? conflict.mine ?? conflict.theirs) as { personId?: string } | undefined;
  const who = `${phase} · ${nameIn(ctx.people)(allocation?.personId)} allocation`;
  if (rest.length === 4) return { label: who, format: (a) => percent((a as { allocationPct: number }).allocationPct), unset: 'removed' };
  if (leaf === 'allocationPct') return { label: who, format: percent };
  if (leaf === 'personId') return { label: `${phase} · allocation person`, format: nameIn(ctx.people) };
  return null;
}

function personField(rest: Path, ctx: ConflictContext, currencySymbol: string): Field | null {
  const key = rest.join('.');
  switch (key) {
    case '':
      return { label: 'Person', format: (p) => (p as Person).name, unset: 'removed' };
    case 'name':
      return { label: 'Name', format: text };
    case 'countryId':
      return { label: 'Country', format: nameIn(ctx.countries) };
    case 'roleId':
      return { label: 'Role', format: nameIn(ctx.roles) };
    case 'capacityPct':
      return { label: 'Capacity %', format: percent };
    case 'active':
      return { label: 'Status', format: status };
    case 'customRole':
      return { label: 'Custom role', format: (r) => (r as { label: string }).label || 'Custom role' };
    case 'customRole.active':
      return { label: 'Role', format: (on) => (on ? 'Custom role' : 'Standard role') };
    case 'customRole.label':
      return { label: 'Custom role label', format: text };
    case 'customRole.costFactor':
      return { label: 'Cost factor', format: text };
    case 'customRole.dayRatesByYear':
      return {
        label: 'Day rate per year',
        format: (rates) =>
          (rates as CustomRoleYearRate[]).map((r) => `${r.year}: ${formatAmount(r.dayRate, currencySymbol)}`).join(', ') || 'none',
      };
  }
  return null;
}

function teamField(rest: Path): Field | null {
  switch (rest.join('.')) {
    case '':
      return { label: 'Team', format: (t) => (t as Team).name, unset: 'removed' };
    case 'name':
      return { label: 'Name', format: text };
    case 'active':
      return { label: 'Status', format: status };
  }
  return null;
}

function membershipField(rest: Path, ctx: ConflictContext): Field | null {
  switch (rest.join('.')) {
    case '':
      return { label: 'Membership', format: (m) => percent((m as Membership).teamFtePct), unset: 'removed' };
    case 'teamFtePct':
      return { label: 'Team FTE %', format: percent };
    case 'active':
      return { label: 'Status', format: status };
    case 'personId':
      return { label: 'Person', format: nameIn(ctx.people) };
    case 'teamId':
      return { label: 'Team', format: nameIn(ctx.teams) };
  }
  return null;
}

/** The raw keys, for a field no label covers yet: phase ids read as their labels, item ids are left out. */
function fallbackLabel(rest: Path, ctx: ConflictContext, initiative: boolean): string {
  const words = rest.flatMap((segment, i) => {
    if (typeof segment !== 'string') return [];
    if (initiative && i === 1 && rest[0] === 'phases') return [ctx.process.find((p) => p.id === segment)?.label ?? segment];
    if (initiative && i === 0 && segment === 'phases') return [];
    return [segment];
  });
  return words.join(' · ') || 'Whole record';
}

/** Name the entity and the field in words, and both values as the screen shows them (§3, §9.9). */
export function describeConflict(conflict: MergeConflict & { file: string }, ctx: ConflictContext): ConflictDescription {
  const initiativeId = /^initiatives\/(.+)\.json$/.exec(conflict.file)?.[1];
  const [first, ...afterItem] = conflict.path;
  const itemId = typeof first === 'object' ? first.id : undefined;

  let entity: string;
  let rest: Path;
  let field: Field | null;
  if (initiativeId !== undefined) {
    const doc = ctx.initiatives.find((i) => i.id === initiativeId);
    entity = doc?.name ?? 'An initiative';
    rest = conflict.path;
    field = initiativeField(rest, doc, conflict, ctx);
  } else {
    rest = afterItem;
    const person = ctx.people.find((p) => p.id === itemId);
    const team = ctx.teams.find((t) => t.id === itemId);
    const membership = ctx.memberships.find((m) => m.id === itemId) ?? ((conflict.mine ?? conflict.theirs) as Membership | undefined);
    switch (conflict.file) {
      case 'people.json':
        entity = person?.name ?? 'A person';
        field = personField(rest, ctx, ctx.currencySymbol);
        break;
      case 'teams.json':
        entity = team?.name ?? 'A team';
        field = teamField(rest);
        break;
      case 'memberships.json':
        entity = `${nameIn(ctx.people)(membership?.personId)} in ${nameIn(ctx.teams)(membership?.teamId)}`;
        field = membershipField(rest, ctx);
        break;
      default:
        entity = conflict.file;
        field = null;
    }
  }

  const unset = field?.unset ?? 'not set';
  const show = (value: unknown) => (value === undefined ? unset : (field?.format ?? fallbackValue)(value));
  return {
    entity,
    field: field?.label ?? fallbackLabel(rest, ctx, initiativeId !== undefined),
    mine: show(conflict.mine),
    theirs: show(conflict.theirs),
    labelled: field !== null,
  };
}
