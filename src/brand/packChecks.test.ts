import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '@brand';
import { checkBrandPack } from './packChecks';
import type { ApprovalTrackDef, BrandPack, PhaseDef } from './types';

const base = defaultBrandPack;
const track = (id: string, lowerBound: number, upperBound?: number): ApprovalTrackDef => ({ ...base.approvalTracks[0], id, lowerBound, upperBound });
const withTracks = (approvalTracks: ApprovalTrackDef[]): BrandPack => ({ ...base, approvalTracks });
const withPhase = (index: number, change: (phase: PhaseDef) => PhaseDef): BrandPack => ({
  ...base,
  process: base.process.map((p, i) => (i === index ? change(structuredClone(p)) : p)),
});
/** The process definition's own failures: renaming a phase id also strands the dataset's references to it. */
const processFailures = (pack: BrandPack) => checkBrandPack(pack).filter((f) => !f.startsWith('exampleDataset'));
const withExample = (change: Partial<BrandPack['exampleDataset']>): BrandPack => ({ ...base, exampleDataset: { ...base.exampleDataset, ...change } });

describe('checkBrandPack (§2, §7.4, §10.7)', () => {
  it('passes the default pack', () => {
    expect(checkBrandPack(base)).toEqual([]);
  });

  describe('branding', () => {
    it('reports an empty page title and a logo or favicon that is not an image file', () => {
      expect(checkBrandPack({ ...base, pageTitle: ' ', logo: { path: 'logo.txt' }, favicon: { path: '' } })).toEqual([
        'pageTitle is empty',
        'logo.path logo.txt is not one of .svg, .png, .ico, .webp',
        'favicon.path (empty) is not one of .svg, .png, .ico, .webp',
      ]);
    });
  });

  describe('approval bands', () => {
    it('reports two bands that overlap, by id', () => {
      expect(checkBrandPack(withTracks([track('light', 0, 60_000), track('standard', 50_000, 200_000)]))).toEqual([
        'approvalTracks[light] overlaps approvalTracks[standard]',
      ]);
    });

    it('reports an unbounded band that reaches into another', () => {
      expect(checkBrandPack(withTracks([track('light', 0), track('standard', 50_000, 200_000)]))).toEqual(['approvalTracks[light] overlaps approvalTracks[standard]']);
    });

    it('accepts bands that only touch, and a gap between bands (§7.4)', () => {
      expect(checkBrandPack(withTracks([track('light', 0, 50_000), track('standard', 50_000, 100_000), track('elevated', 150_000)]))).toEqual([]);
    });

    it('reports a band whose lower bound is not below its upper bound', () => {
      expect(checkBrandPack(withTracks([track('light', 50_000, 50_000)]))).toEqual(['approvalTracks[light] lowerBound 50000 is not below upperBound 50000']);
    });

    it('reports a band id used twice', () => {
      expect(checkBrandPack(withTracks([track('light', 0, 10), track('light', 10, 20)]))).toEqual(['approvalTracks[light] id is used twice']);
    });
  });

  describe('process definition', () => {
    it.each([
      ['a phase label', (p: PhaseDef) => ({ ...p, label: '' }), 'process[discovery].label is empty'],
      ['a phase description', (p: PhaseDef) => ({ ...p, description: ' ' }), 'process[discovery].description is empty'],
      ['a phase id', (p: PhaseDef) => ({ ...p, id: '' }), 'process[0].id is empty'],
      ['a gate id', (p: PhaseDef) => ({ ...p, exitGate: { ...p.exitGate, id: '' } }), 'process[discovery].exitGate.id is empty'],
      ['a gate label', (p: PhaseDef) => ({ ...p, exitGate: { ...p.exitGate, label: '' } }), 'process[discovery].exitGate.label is empty'],
      ['a gate description', (p: PhaseDef) => ({ ...p, exitGate: { ...p.exitGate, description: '' } }), 'process[discovery].exitGate.description is empty'],
      [
        'a checklist item name',
        (p: PhaseDef) => ({ ...p, exitGate: { ...p.exitGate, checklistItems: [{ ...p.exitGate.checklistItems[0], name: '' }] } }),
        'process[discovery].exitGate.checklistItems[g1-problem-statement].name is empty',
      ],
      [
        'a checklist item description',
        (p: PhaseDef) => ({ ...p, exitGate: { ...p.exitGate, checklistItems: [{ ...p.exitGate.checklistItems[0], description: '' }] } }),
        'process[discovery].exitGate.checklistItems[g1-problem-statement].description is empty',
      ],
      [
        'a checklist item id',
        (p: PhaseDef) => ({ ...p, exitGate: { ...p.exitGate, checklistItems: [{ ...p.exitGate.checklistItems[0], id: '' }] } }),
        'process[discovery].exitGate.checklistItems[0].id is empty',
      ],
    ])('reports %s that is empty', (_, change, message) => {
      expect(processFailures(withPhase(0, change))).toEqual([message]);
    });

    it('reports an icon outside the icon set', () => {
      const pack = withPhase(0, (p) => ({ ...p, icon: 'smile' as PhaseDef['icon'] }));
      expect(processFailures(pack)).toEqual(['process[discovery].icon "smile" is not in the icon set (search, clipboard-check, hammer, rocket)']);
    });

    it('reports a costed phase without a default duration', () => {
      expect(processFailures(withPhase(1, (p) => ({ ...p, defaultDurationMonths: undefined })))).toEqual([
        'process[validation].defaultDurationMonths is missing (a costed phase needs one above 0)',
      ]);
      expect(processFailures(withPhase(1, (p) => ({ ...p, defaultDurationMonths: 0 })))).toHaveLength(1);
    });

    it('reports an id used twice across phases and gates', () => {
      expect(processFailures(withPhase(1, (p) => ({ ...p, id: 'discovery' })))).toEqual(['process[discovery] id discovery is used twice']);
      expect(processFailures(withPhase(1, (p) => ({ ...p, exitGate: { ...p.exitGate, id: 'g1' } })))).toEqual(['process[validation].exitGate id g1 is used twice']);
      expect(
        processFailures(withPhase(1, (p) => ({ ...p, exitGate: { ...p.exitGate, checklistItems: [{ ...p.exitGate.checklistItems[0], id: 'g1-problem-statement' }] } }))),
      ).toEqual(['process[validation].exitGate.checklistItems[g1-problem-statement] id g1-problem-statement is used twice']);
    });
  });

  describe('example dataset', () => {
    it('reports another process id or structure version', () => {
      expect(checkBrandPack(withExample({ processIdentity: { id: 'other', structureVersion: 2 } }))).toEqual([
        'exampleDataset.processIdentity.id "other" is not the pack\'s "initiative-planner-core"',
        'exampleDataset.processIdentity.structureVersion 2 is not the pack\'s 1',
      ]);
    });

    it('reports a dataset with no process identity', () => {
      expect(checkBrandPack(withExample({ processIdentity: undefined as never }))).toHaveLength(2);
    });

    it('reports a person with a role, country or team the pack lacks', () => {
      const people = [{ ...base.exampleDataset.people[0], role: 'QA', country: 'France', team: 'ghost' }];
      expect(checkBrandPack(withExample({ people, initiatives: [] }))).toEqual([
        `exampleDataset.people[${people[0].key}].role QA is not a role of the pack`,
        `exampleDataset.people[${people[0].key}].country France is not a country of the pack`,
        `exampleDataset.people[${people[0].key}].team ghost is not in exampleDataset.teams`,
      ]);
    });

    it('reports an initiative using a phase, team, owner or person the pack lacks', () => {
      const initiative = {
        name: 'Checkout',
        description: '',
        owner: 'nobody',
        team: 'ghost',
        phases: { build: { fromMonth: 0, toMonth: 1, allocations: [{ person: 'nobody', pct: 50 }] } },
        passedGates: [{ phase: 'launch', month: 0 }],
      };
      expect(checkBrandPack(withExample({ initiatives: [initiative] }))).toEqual([
        'exampleDataset.initiatives[Checkout].team ghost is not in exampleDataset.teams',
        'exampleDataset.initiatives[Checkout].owner nobody is not in exampleDataset.people',
        'exampleDataset.initiatives[Checkout].phases has phase build, which is not a phase of the pack',
        'exampleDataset.initiatives[Checkout].phases.build allocates nobody, who is not in exampleDataset.people',
        'exampleDataset.initiatives[Checkout].passedGates has phase launch, which is not a phase of the pack',
      ]);
    });
  });
});
