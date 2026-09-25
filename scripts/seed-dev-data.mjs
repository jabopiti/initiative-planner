// Resets the development dataset, then fills it with the example teams, people and initiatives from
// backlog/example-data.md ("Example teams, people, initiatives"), so a browser check has something to
// look at. Run with `npm run dev:seed-data`. See scripts/dev-data.mjs for the target and token handling.
//
// Roles and countries are looked up on the data branch (roles by abbreviation, countries by name), so
// the ids match what the app reads. Every write is one commit. Every initiative starts in Discovery:
// the current phase is not derived from gates until slice 008, so "current phase" in the example table
// can't be seeded yet. Phase plans (dates and allocations) are seeded instead, in three states: fully
// planned, dates without people, and not planned at all.
import { randomUUID } from 'node:crypto';
import { call, readJson, resetDevData, target, writeJson } from './dev-data.mjs';

console.log(`Seeding ${target}`);

const roles = readJson(await call('GET', 'roles.json'));
const countries = readJson(await call('GET', 'countries.json'));
const roleId = (abbreviation) => {
  const role = roles?.find((r) => r.abbreviation === abbreviation);
  if (!role) throw new Error(`roles.json has no role with abbreviation ${abbreviation}`);
  return role.id;
};
const countryId = (name) => {
  const country = countries?.find((c) => c.name === name);
  if (!country) throw new Error(`countries.json has no country named ${name}`);
  return country.id;
};

const teams = [
  { id: randomUUID(), name: 'Platform', active: true },
  { id: randomUUID(), name: 'Growth', active: true },
];
const [platform, growth] = teams;

// [name, role, country, team]
const members = [
  ['Mara Voss', 'PM', 'Germany', platform],
  ['Lucía Ramos', 'XD', 'Spain', platform],
  ['Jonas Keller', 'TL', 'Germany', platform],
  ['Felix Brandt', 'Dev', 'Germany', platform],
  ['Elena Torres', 'Dev', 'Spain', platform],
  ['Carla Fernández', 'PM', 'Spain', growth],
  ['Tobias Wagner', 'TL', 'Germany', growth],
  ['Sofia Molina', 'Dev', 'Spain', growth],
  ['Paul Richter', 'Dev', 'Germany', growth],
];
const people = members.map(([name, role, country]) => ({
  id: randomUUID(),
  name,
  countryId: countryId(country),
  roleId: roleId(role),
  capacityPct: 100,
  active: true,
}));
const memberships = members.map(([, , , team], i) => ({
  id: randomUUID(),
  personId: people[i].id,
  teamId: team.id,
  teamFtePct: 100,
  active: true,
}));
const person = (name) => people.find((p) => p.name === name).id;
const allocate = (...pairs) => pairs.map(([name, allocationPct]) => ({ id: randomUUID(), personId: person(name), allocationPct }));

const initiatives = [
  {
    id: randomUUID(),
    name: 'Checkout Redesign',
    description: 'Rebuild the checkout flow to cut abandonment.',
    ownerId: person('Mara Voss'),
    teamId: platform.id,
    status: 'Active',
    phases: {
      validation: {
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        allocations: allocate(['Mara Voss', 50], ['Lucía Ramos', 60], ['Jonas Keller', 30]),
      },
      development: {
        startDate: '2027-01-04',
        endDate: '2027-06-30',
        allocations: allocate(['Mara Voss', 30], ['Lucía Ramos', 40], ['Jonas Keller', 50], ['Felix Brandt', 100], ['Elena Torres', 80]),
      },
    },
  },
  {
    id: randomUUID(),
    name: 'Fraud Detection Upgrade',
    description: 'Replace the rules engine with a scored model.',
    teamId: platform.id,
    status: 'Active',
  },
  {
    id: randomUUID(),
    name: 'Onboarding Flow v2',
    description: 'Shorten sign-up to the first successful action.',
    ownerId: person('Carla Fernández'),
    teamId: growth.id,
    status: 'Active',
    phases: {
      validation: {
        startDate: '2026-11-02',
        endDate: '2027-01-29',
        allocations: allocate(['Carla Fernández', 60], ['Tobias Wagner', 20], ['Sofia Molina', 50]),
      },
      development: { startDate: '2027-02-01', endDate: '2027-07-30', allocations: [] },
    },
  },
];

await resetDevData();
await writeJson('teams.json', teams, 'teams: seeded for development');
await writeJson('people.json', people, 'people: seeded for development');
await writeJson('memberships.json', memberships, 'memberships: seeded for development');
for (const initiative of initiatives) {
  await writeJson(`initiatives/${initiative.id}.json`, initiative, `${initiative.name}: seeded for development`);
  console.log(`wrote ${initiative.name}`);
}
console.log(`Done: ${teams.length} teams, ${people.length} people, ${initiatives.length} initiatives.`);
