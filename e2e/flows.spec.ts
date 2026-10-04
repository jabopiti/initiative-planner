import { expect, test } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { connect, createInitiative, createTeam, FAKE_TOKEN, watchCspViolations } from './support/session';

// The main flows §10.8 names beyond creating and planning: passing a gate, a same-field conflict, read-only mode.

interface StoredInitiative {
  name: string;
  gates?: Record<string, { outcome: string; checklist: { status: string }[] }>;
}

test('passing a gate: its checklist resolved, the gate is recorded on the initiative', async ({ page }) => {
  const github = fakeGithub(page);
  const csp = watchCspViolations(page);
  await github.install();
  await connect(page);
  await createTeam(page, 'Platform');
  await createInitiative(page, 'Checkout Redesign', 'Platform');
  await expect.poll(() => github.paths('initiatives/').length).toBe(1);
  const [path] = github.paths('initiatives/');

  for (const item of ['Problem statement validated', 'Stakeholders aligned']) {
    await page.getByRole('radiogroup', { name: `Status of "${item}"` }).getByRole('radio', { name: 'Complete', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Pass gate' }).click();
  await expect(page.getByText('Passed G1')).toBeVisible();

  await expect
    .poll(() => github.read<StoredInitiative>(path)?.gates?.discovery)
    .toMatchObject({ outcome: 'passed', checklist: [{ status: 'complete' }, { status: 'complete' }] });
  expect(csp).toEqual([]);
});

test('a same-field conflict is never overwritten silently: both values show and Use mine saves the typed one', async ({ page }) => {
  const github = fakeGithub(page);
  const csp = watchCspViolations(page);
  await github.install();
  await connect(page);
  await createTeam(page, 'Platform');
  await createInitiative(page, 'Checkout Redesign', 'Platform');
  await expect.poll(() => github.paths('initiatives/').length).toBe(1);
  const [path] = github.paths('initiatives/');

  // Someone else renames the initiative while this user is still on the old name, then this user renames it too.
  github.edit<StoredInitiative>(path, (initiative) => ({ ...initiative, name: 'Checkout Rebuild' }));
  const name = page.getByRole('textbox', { name: 'Initiative name' });
  await name.fill('Checkout Revamp');
  await name.blur();

  // Their value shows in the conflict message the field is described by.
  await expect(name).toHaveAccessibleDescription(/Checkout Rebuild/);
  await expect(page.getByRole('button', { name: 'Keep theirs' })).toBeVisible();
  expect(github.read<StoredInitiative>(path)?.name).toBe('Checkout Rebuild');

  await page.getByRole('button', { name: 'Use mine' }).click();
  await expect.poll(() => github.read<StoredInitiative>(path)?.name).toBe('Checkout Revamp');
  await expect(page.getByRole('button', { name: 'Use mine' })).toBeHidden();
  expect(csp).toEqual([]);
});

test('read-only mode: a token GitHub stops accepting turns the app read-only, with the cause named', async ({ page }) => {
  const github = fakeGithub(page);
  await github.install();
  await connect(page);
  await createTeam(page, 'Platform');
  await expect.poll(() => github.read<{ name: string }[]>('teams.json')?.map((t) => t.name)).toEqual(['Platform']);

  github.rejectToken(FAKE_TOKEN);
  await page.goto('/#/teams');
  await page.getByRole('button', { name: 'New team' }).click();
  await page.getByPlaceholder('Team name').fill('Growth');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByText('Read-only · Access denied')).toBeVisible();
  // The last-synced data is still there to read, and nothing was committed for the refused edit.
  await expect(page.getByRole('link', { name: 'Platform' })).toBeVisible();
  expect(github.read<{ name: string }[]>('teams.json')?.map((t) => t.name)).toEqual(['Platform']);
});

test('first run: the welcome card is the one way to create a team, and Teams opens with its button focused and highlighted', async ({ page }) => {
  await fakeGithub(page).install();
  await connect(page);

  await expect(page.getByRole('heading', { name: /^Welcome to/ })).toBeVisible();
  // The top bar's button is hidden meanwhile, so Create a team appears once (§9.4).
  await expect(page.getByRole('button', { name: 'Create a team' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Create a team' }).click();

  // Arriving from the step (§5.2): Teams' own Create a team has focus and the Accent ring, for 3 seconds.
  const create = page.getByRole('main').getByRole('button', { name: 'Create a team' });
  await expect(create).toBeFocused();
  await expect(create).toHaveClass(/ring-brand-accent/);
  await expect(create).not.toHaveClass(/ring-brand-accent/, { timeout: 5000 });
});
