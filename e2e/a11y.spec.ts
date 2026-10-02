import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { addPerson, connect, createInitiative, createTeam, enterToken, FAKE_TOKEN, watchCspViolations } from './support/session';

// WCAG 2.1 A and AA rules, the level the app aims for. Each screen is scanned in the state a user meets it.
// A scan that lands mid-transition (a button fading back from disabled) measures a blended colour, so it is
// retried until the screen settles; a real violation is still there on every attempt and fails the test.
async function expectNoViolations(page: Page) {
  await expect(async () => {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(
      violations.map((v) => ({ rule: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target.join(' ')) })),
    ).toEqual([]);
  }).toPass({ timeout: 5_000 });
}

test('the Connect screen has no accessibility violations', async ({ page }) => {
  await fakeGithub(page, { rejectedTokens: [FAKE_TOKEN] }).install();
  await page.goto('/');
  await expect(page.getByLabel('GitHub token')).toBeVisible();
  await expectNoViolations(page);

  // The error state is announced and styled differently, so it is scanned as well.
  await enterToken(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expectNoViolations(page);
});

test('the app screens have no accessibility violations', async ({ page }) => {
  const csp = watchCspViolations(page);
  await fakeGithub(page).install();
  await connect(page);

  await expect(page.getByText('No initiatives yet')).toBeVisible();
  await expectNoViolations(page); // portfolio, empty

  await createTeam(page, 'Platform');
  await expectNoViolations(page); // teams overview

  await addPerson(page, 'Mara Voss');
  await expectNoViolations(page); // people

  // Team detail with the Add member list open and an option active (§9.5).
  await page.goto('/#/teams');
  await page.getByRole('link', { name: 'Platform' }).first().click();
  const add = page.getByRole('combobox', { name: 'Add member' });
  await add.fill('Mara');
  await add.press('ArrowDown');
  await expect(page.getByRole('option', { name: /Mara Voss/ })).toHaveAttribute('aria-selected', 'true');
  await expectNoViolations(page); // team detail
  await add.press('Escape');

  await createInitiative(page, 'Checkout Redesign', 'Platform');
  await expectNoViolations(page); // initiative detail

  // A hash navigation is same-document, so wait for something only the target screen shows before scanning.
  const section = (label: string) => () =>
    page.getByRole('navigation', { name: 'Settings sections' }).locator('[aria-current="page"]', { hasText: label });
  const screens: [route: string, ready: () => Locator][] = [
    ['/#/initiatives', () => page.getByRole('heading', { level: 1, name: 'Initiatives' })],
    // The portfolio has no nav item of its own: it is the screen where Initiatives is no longer the current page.
    ['/#/portfolio', () => page.getByRole('navigation', { name: 'Primary' }).locator('a:not([aria-current])', { hasText: 'Initiatives' })],
    ['/#/settings/roles', section('Roles')],
    ['/#/settings/countries', section('Countries & rates')],
    ['/#/settings/process', section('Process')],
    ['/#/settings/connection', section('Connection')],
    ['/#/settings/about', section('About')],
    ['/#/settings/danger-zone', section('Danger zone')],
  ];
  for (const [route, ready] of screens) {
    await page.goto(route);
    await expect(ready()).toBeVisible();
    await expectNoViolations(page);
  }
  expect(csp).toEqual([]);
});
