import { describe, expect, it } from 'vitest';
import { FILE_PATHS, type Initiative } from '../data/types';
import { initiative, person } from '../sync/testing/fakeGithub';
import { conflictHome } from './conflictHome';

const file = FILE_PATHS.initiative('i1');
const ctx = (i: Initiative, people = [person('p1', 'Felix Brandt')]) => ({ initiatives: [i], memberships: [], people });
const passed: Initiative['gates'] = { development: { outcome: 'passed', checklist: [] } };

describe('conflictHome: only where an editable text field shows the conflict (§9.9)', () => {
  it('sends a text field to its initiative', () => {
    expect(conflictHome(file, ['name'], ctx(initiative()))).toBe('/initiatives/i1');
    expect(conflictHome(file, ['phases', 'development', 'startDate'], ctx(initiative()))).toBe('/initiatives/i1');
  });

  it('keeps a Closed initiative\'s read-only fields in the banner, but not its actuals (§8.4)', () => {
    const closed = initiative({ status: 'Closed' });
    expect(conflictHome(file, ['name'], ctx(closed))).toBeNull();
    expect(conflictHome(file, ['phases', 'development', 'startDate'], ctx(closed))).toBeNull();
    expect(conflictHome(file, ['phases', 'development', 'actualMonths', '2026-10'], ctx(closed))).toBe('/initiatives/i1');
  });

  it('keeps a frozen phase\'s plan in the banner (§8.1)', () => {
    const frozen = initiative({ gates: passed });
    expect(conflictHome(file, ['phases', 'development', 'endDate'], ctx(frozen))).toBeNull();
    expect(conflictHome(file, ['name'], ctx(frozen))).toBe('/initiatives/i1');
  });

  it('keeps an inactive person\'s fields, and an inactive custom role\'s, in the banner', () => {
    const felix = person('p1', 'Felix Brandt');
    const name = [{ id: 'p1' }, 'name'];
    const label = [{ id: 'p1' }, 'customRole', 'label'];
    expect(conflictHome(FILE_PATHS.people, name, ctx(initiative(), [felix]))).toBe('/people');
    expect(conflictHome(FILE_PATHS.people, name, ctx(initiative(), [{ ...felix, active: false }]))).toBeNull();
    expect(conflictHome(FILE_PATHS.people, label, ctx(initiative(), [felix]))).toBeNull();
    const custom = { ...felix, customRole: { active: true, label: 'CTO', costFactor: 1, dayRatesByYear: [] } };
    expect(conflictHome(FILE_PATHS.people, label, ctx(initiative(), [custom]))).toBe('/people');
  });
});
