import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { addPerson, connect, createInitiative, createTeam, enterToken, FAKE_TOKEN, watchCspViolations } from './support/session';

// WCAG 2.1 A and AA rules, the level the app aims for. Each screen is scanned in the state a user meets it.
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(
    violations.map((v) => ({ rule: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target.join(' ')) })),
  ).toEqual([]);
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

  await createInitiative(page, 'Checkout Redesign', 'Platform');
  await expectNoViolations(page); // initiative detail

  for (const route of ['/#/initiatives', '/#/portfolio', '/#/settings/roles', '/#/settings/countries', '/#/settings/process', '/#/settings/connection', '/#/settings/about']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expectNoViolations(page);
  }
  expect(csp).toEqual([]);
});
