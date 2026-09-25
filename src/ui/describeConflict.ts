import type { PhaseDef } from '../brand/types';
import { formatDateField, formatMonth } from '../data/dates';
import { FILE_PATHS, type Country, type Allocation, type CostItem, type CustomRoleYearRate, type Initiative, type Membership, type Person, type Role, type Team } from '../data/types';
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

const nameField: Field = { label: 'Name', format: text };
const statusField: Field = { label: 'Status', format: status };

/**
 * The list item a conflict is about, as the screen has it. When the conflict is the item itself and one
 * side removed it, whichever side still has it.
 */
function itemAt(doc: unknown, conflict: MergeConflict, depth: number): unknown {
  const onScreen = getAtPath(doc, conflict.path.slice(0, depth));
  return onScreen ?? (conflict.path.length === depth ? (conflict.mine ?? conflict.theirs) : undefined);
}

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
      return nameField;
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
  if (typeof item !== 'object' || rest.length > 5) return null;
  if (part === 'costItems') return costItemField(phase, itemAt(doc, conflict, 4) as CostItem | undefined, rest.length === 4, leaf, ctx);
  if (part !== 'allocations') return null;

  const allocation = itemAt(doc, conflict, 4) as Allocation | undefined;
  const who = `${phase} · ${nameIn(ctx.people)(allocation?.personId)} allocation`;
  if (rest.length === 4) return { label: who, format: (a) => percent((a as { allocationPct: number }).allocationPct), unset: 'removed' };
  if (leaf === 'allocationPct') return { label: who, format: percent };
  if (leaf === 'personId') return { label: `${phase} · allocation person`, format: nameIn(ctx.people) };
  return null;
}

/** A cost item of a phase, or one of its values: named by its label as the table shows it. */
function costItemField(phase: string, item: CostItem | undefined, whole: boolean, leaf: unknown, ctx: ConflictContext): Field | null {
  const what = `${phase} · ${item?.label.trim() || 'cost item'}`;
  const amount = (value: unknown) => formatAmount(Number(value), ctx.currencySymbol);
  if (whole) return { label: `${phase} · cost item`, format: (c) => `${(c as CostItem).label} ${amount((c as CostItem).amount)}`, unset: 'removed' };
  switch (leaf) {
    case 'label':
      return { label: `${phase} · cost item label`, format: text };
    case 'amount':
      return { label: `${what} amount`, format: amount };
    case 'timing':
      return { label: `${what} timing`, format: (t) => (t === 'month' ? 'One month' : 'Spread over the phase') };
    case 'month':
      return { label: `${what} month`, format: (m) => formatMonth(String(m)) };
    default:
      return null;
  }
}

/** The master files (§10.2): a list of records, each conflict path starting at the item's id. */
interface MasterFile {
  list: (ctx: ConflictContext) => { id: string }[];
  entity: (item: unknown, ctx: ConflictContext) => string;
  fields: (ctx: ConflictContext) => Record<string, Field>;
}

const masterFiles: Record<string, MasterFile> = {
  [FILE_PATHS.people]: {
    list: (ctx) => ctx.people,
    entity: (person) => (person as Person | undefined)?.name ?? 'A person',
    fields: (ctx) => ({
      '': { label: 'Person', format: (p) => (p as Person).name, unset: 'removed' },
      name: nameField,
      countryId: { label: 'Country', format: nameIn(ctx.countries) },
      roleId: { label: 'Role', format: nameIn(ctx.roles) },
      capacityPct: { label: 'Capacity %', format: percent },
      active: statusField,
      customRole: { label: 'Custom role', format: (r) => (r as { label: string }).label.trim() || 'Custom role' },
      'customRole.active': { label: 'Role', format: (on) => (on ? 'Custom role' : 'Standard role') },
      'customRole.label': { label: 'Custom role label', format: text },
      'customRole.costFactor': { label: 'Cost factor', format: text },
      'customRole.dayRatesByYear': {
        label: 'Day rate per year',
        format: (rates) =>
          (rates as CustomRoleYearRate[]).map((r) => `${r.year}: ${formatAmount(r.dayRate, ctx.currencySymbol)}`).join(', ') || 'none',
      },
    }),
  },
  [FILE_PATHS.teams]: {
    list: (ctx) => ctx.teams,
    entity: (team) => (team as Team | undefined)?.name ?? 'A team',
    fields: () => ({
      '': { label: 'Team', format: (t) => (t as Team).name, unset: 'removed' },
      name: nameField,
      active: statusField,
    }),
  },
  [FILE_PATHS.memberships]: {
    list: (ctx) => ctx.memberships,
    entity: (membership, ctx) => {
      const m = membership as Membership | undefined;
      return m ? `${nameIn(ctx.people)(m.personId)} in ${nameIn(ctx.teams)(m.teamId)}` : 'A membership';
    },
    fields: (ctx) => ({
      '': { label: 'Membership', format: (m) => percent((m as Membership).teamFtePct), unset: 'removed' },
      teamFtePct: { label: 'Team FTE %', format: percent },
      active: statusField,
      personId: { label: 'Person', format: nameIn(ctx.people) },
      teamId: { label: 'Team', format: nameIn(ctx.teams) },
    }),
  },
};

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
  const initiative = ctx.initiatives.find((i) => FILE_PATHS.initiative(i.id) === conflict.file);
  const master = masterFiles[conflict.file];

  let entity: string;
  let rest: Path;
  let field: Field | null;
  if (initiative) {
    entity = initiative.name;
    rest = conflict.path;
    field = initiativeField(rest, initiative, conflict, ctx);
  } else if (master) {
    rest = conflict.path.slice(1);
    entity = master.entity(itemAt(master.list(ctx), conflict, 1), ctx);
    field = master.fields(ctx)[rest.join('.')] ?? null;
  } else {
    entity = conflict.file;
    rest = conflict.path;
    field = null;
  }

  const unset = field?.unset ?? 'not set';
  const show = (value: unknown) => (value === undefined ? unset : (field?.format ?? fallbackValue)(value));
  return {
    entity,
    field: field?.label ?? fallbackLabel(rest, ctx, initiative !== undefined),
    mine: show(conflict.mine),
    theirs: show(conflict.theirs),
    labelled: field !== null,
  };
}
