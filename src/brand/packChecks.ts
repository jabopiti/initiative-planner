import { PHASE_ICON_NAMES, type BrandPack } from './types';

/**
 * The brand pack's structural rules (§2, §7.4, §10.7), run by the build next to the colour and font checks: approval
 * bands that overlap, a process definition with a missing field or a repeated id, and an example dataset written for
 * another process or using a phase, role, country or team the pack doesn't have. Each failure names the entity and field.
 * A gap between bands is allowed: a total no band covers resolves to No approval track (§7.4).
 */
export function checkBrandPack(pack: BrandPack): string[] {
  return [...checkBranding(pack), ...checkApprovalTracks(pack), ...checkProcess(pack), ...checkExampleDataset(pack)];
}

const blank = (value: string | undefined) => !value?.trim();

const IMAGE_TYPES = ['svg', 'png', 'ico', 'webp'];

function checkBranding({ pageTitle, logo, favicon }: BrandPack): string[] {
  const failures: string[] = [];
  if (blank(pageTitle)) failures.push('pageTitle is empty');
  for (const [field, image] of [['logo', logo], ['favicon', favicon]] as const) {
    const type = image.path.split('.').pop()?.toLowerCase();
    if (!type || !IMAGE_TYPES.includes(type)) failures.push(`${field}.path ${image.path || '(empty)'} is not one of ${IMAGE_TYPES.map((t) => `.${t}`).join(', ')}`);
  }
  return failures;
}

function checkApprovalTracks({ approvalTracks }: BrandPack): string[] {
  const failures: string[] = [];
  const name = (i: number) => `approvalTracks[${approvalTracks[i].id}]`;
  const ids = new Set<string>();
  approvalTracks.forEach((t, i) => {
    if (blank(t.id)) failures.push(`approvalTracks[${i}].id is empty`);
    else if (ids.has(t.id)) failures.push(`${name(i)} id is used twice`);
    ids.add(t.id);
    if (t.upperBound !== undefined && t.lowerBound >= t.upperBound) {
      failures.push(`${name(i)} lowerBound ${t.lowerBound} is not below upperBound ${t.upperBound}`);
    }
  });
  // Bounds are lower-inclusive and upper-exclusive, so bands that only touch don't overlap.
  const end = (i: number) => approvalTracks[i].upperBound ?? Infinity;
  for (let a = 0; a < approvalTracks.length; a++) {
    for (let b = a + 1; b < approvalTracks.length; b++) {
      if (approvalTracks[a].lowerBound < end(b) && approvalTracks[b].lowerBound < end(a)) {
        failures.push(`${name(a)} overlaps ${name(b)}`);
      }
    }
  }
  return failures;
}

function checkProcess({ process }: BrandPack): string[] {
  const failures: string[] = [];
  const seen = new Set<string>();
  const claim = (id: string, where: string) => {
    if (blank(id)) failures.push(`${where}.id is empty`);
    else if (seen.has(id)) failures.push(`${where} id ${id} is used twice`);
    seen.add(id);
  };
  const need = (value: string | undefined, where: string, field: string) => {
    if (blank(value)) failures.push(`${where}.${field} is empty`);
  };
  process.forEach((phase, i) => {
    const where = `process[${blank(phase.id) ? i : phase.id}]`;
    claim(phase.id, where);
    need(phase.label, where, 'label');
    need(phase.description, where, 'description');
    if (!(PHASE_ICON_NAMES as readonly string[]).includes(phase.icon)) {
      failures.push(`${where}.icon "${phase.icon}" is not in the icon set (${PHASE_ICON_NAMES.join(', ')})`);
    }
    if (phase.costed && !(phase.defaultDurationMonths && phase.defaultDurationMonths > 0)) {
      failures.push(`${where}.defaultDurationMonths is missing (a costed phase needs one above 0)`);
    }
    const gate = phase.exitGate;
    const gateWhere = `${where}.exitGate`;
    claim(gate.id, gateWhere);
    need(gate.label, gateWhere, 'label');
    need(gate.description, gateWhere, 'description');
    gate.checklistItems.forEach((item, j) => {
      const itemWhere = `${gateWhere}.checklistItems[${blank(item.id) ? j : item.id}]`;
      claim(item.id, itemWhere);
      need(item.name, itemWhere, 'name');
      need(item.description, itemWhere, 'description');
    });
  });
  return failures;
}

function checkExampleDataset(pack: BrandPack): string[] {
  const failures: string[] = [];
  const { processIdentity: own, exampleDataset: example } = pack;
  const theirs = example.processIdentity;
  if (theirs?.id !== own.id) failures.push(`exampleDataset.processIdentity.id "${theirs?.id}" is not the pack's "${own.id}"`);
  if (theirs?.structureVersion !== own.structureVersion) {
    failures.push(`exampleDataset.processIdentity.structureVersion ${theirs?.structureVersion} is not the pack's ${own.structureVersion}`);
  }
  const phaseIds = new Set(pack.process.map((p) => p.id));
  const roles = new Set(pack.freshInstallBaseline.roles.map((r) => r.abbreviation));
  const countries = new Set(pack.freshInstallBaseline.countries.map((c) => c.name));
  const teams = new Set(example.teams.map((t) => t.key));
  const people = new Set(example.people.map((p) => p.key));
  example.people.forEach((p) => {
    const where = `exampleDataset.people[${p.key}]`;
    if (!roles.has(p.role)) failures.push(`${where}.role ${p.role} is not a role of the pack`);
    if (!countries.has(p.country)) failures.push(`${where}.country ${p.country} is not a country of the pack`);
    if (!teams.has(p.team)) failures.push(`${where}.team ${p.team} is not in exampleDataset.teams`);
  });
  example.initiatives.forEach((initiative) => {
    const where = `exampleDataset.initiatives[${initiative.name}]`;
    if (!teams.has(initiative.team)) failures.push(`${where}.team ${initiative.team} is not in exampleDataset.teams`);
    if (initiative.owner && !people.has(initiative.owner)) failures.push(`${where}.owner ${initiative.owner} is not in exampleDataset.people`);
    for (const [phaseId, plan] of Object.entries(initiative.phases ?? {})) {
      if (!phaseIds.has(phaseId)) failures.push(`${where}.phases has phase ${phaseId}, which is not a phase of the pack`);
      plan.allocations.forEach((a) => {
        if (!people.has(a.person)) failures.push(`${where}.phases.${phaseId} allocates ${a.person}, who is not in exampleDataset.people`);
      });
    }
    initiative.passedGates.forEach((g) => {
      if (!phaseIds.has(g.phase)) failures.push(`${where}.passedGates has phase ${g.phase}, which is not a phase of the pack`);
    });
  });
  return failures;
}
