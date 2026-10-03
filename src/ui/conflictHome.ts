import { isInitiativeFrozen, isPhaseLocked } from '../data/frozen';
import { FILE_PATHS, type Initiative, type Membership, type Person } from '../data/types';
import type { Path } from '../sync/merge';

/** One path segment's pattern: a key, any key (`*`), a list item (`{}`), or any of several keys. */
type Segment = string | string[];
const ANY = '*';
const ITEM = '{}';

/** The fields a text field shows inline when in conflict (§9.9): the rest are resolved in the banner. */
const INITIATIVE_FIELDS: Segment[][] = [
  ['name'],
  ['description'],
  ['phases', ANY, ['startDate', 'endDate']],
  ['phases', ANY, 'allocations', ITEM, 'allocationPct'],
  ['phases', ANY, 'actualMonths', ANY],
  ['phases', ANY, 'costItems', ITEM, ['label', 'amount', 'month']],
];
const MASTER_FIELDS: Record<string, Segment[][]> = {
  [FILE_PATHS.people]: [
    [ITEM, ['name', 'capacityPct']],
    [ITEM, 'customRole', ['label', 'costFactor', 'dayRatesByYear']],
  ],
  [FILE_PATHS.memberships]: [[ITEM, 'teamFtePct']],
  [FILE_PATHS.roles]: [[ITEM, ['name', 'abbreviation', 'costFactor']]],
  [FILE_PATHS.countries]: [[ITEM, ['name', 'ratesByYear']]],
};

function matches(path: Path, pattern: Segment[]): boolean {
  return (
    path.length === pattern.length &&
    pattern.every((p, i) => {
      const segment = path[i];
      if (p === ITEM) return typeof segment === 'object';
      if (typeof segment !== 'string') return false;
      return p === ANY || (Array.isArray(p) ? p.includes(segment) : p === segment);
    })
  );
}

/** Whether the initiative's page shows the field as an editable text field now: a Closed or Cancelled initiative
 * keeps only its actuals editable (§8.4), and a phase behind a passed gate shows its frozen snapshot (§8.1). */
function editableOnInitiative(initiative: Initiative, path: Path): boolean {
  if (path[0] !== 'phases') return !isInitiativeFrozen(initiative);
  if (path[2] === 'actualMonths') return true;
  return !isPhaseLocked(initiative, path[1] as string);
}

/**
 * Where a conflict's field is edited, for the banner's Show (§9.9): the initiative's page, People (whose panel
 * opens on arrival), the membership's team, or the role's or country's Settings section. Null when no text
 * field shows it inline (a select, a toggle, a whole list item, a field read-only or not shown just now — a
 * frozen phase, an inactive person, an inactive custom role): the banner resolves those itself.
 */
export function conflictHome(
  file: string,
  path: Path,
  ctx: { initiatives: Initiative[]; memberships: Membership[]; people: Person[] },
): string | null {
  const initiative = ctx.initiatives.find((i) => FILE_PATHS.initiative(i.id) === file);
  if (initiative) {
    return INITIATIVE_FIELDS.some((p) => matches(path, p)) && editableOnInitiative(initiative, path) ? `/initiatives/${initiative.id}` : null;
  }
  if (!(MASTER_FIELDS[file] ?? []).some((p) => matches(path, p))) return null;
  const item = path[0] as { id: string };
  switch (file) {
    case FILE_PATHS.people: {
      // An inactive person's panel is disabled, and a custom role's fields show only while it is active.
      const person = ctx.people.find((p) => p.id === item.id);
      if (!person?.active || (path[1] === 'customRole' && person.customRole?.active !== true)) return null;
      return '/people';
    }
    case FILE_PATHS.memberships: {
      const teamId = ctx.memberships.find((m) => m.id === item.id)?.teamId;
      return teamId ? `/teams/${teamId}` : null;
    }
    case FILE_PATHS.roles:
      return '/settings/roles';
    default:
      return '/settings/countries';
  }
}
