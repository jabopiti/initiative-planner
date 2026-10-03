import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { addPerson, connect, createInitiative, createTeam, enterToken, FAKE_TOKEN, watchCspViolations } from './support/session';

// WCAG 2.1 A and AA rules, the level the app aims for. Each screen is scanned in the state a user meets it.
// A scan that lands mid-transition (a button fading back from disabled) measures a blended colour, so it is
// retried until the screen settles; a real violation is still there on every attempt and fails the test.
async function expectNoViolations(page: Page) {
  await expect(async () => {
    // The best-practice landmark rules too: routed content sits in <main>, and nothing is left outside a landmark.
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .options({ rules: { region: { enabled: true }, 'landmark-one-main': { enabled: true } } })
      .analyze();
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

// Every screen in both themes (§9.1, §9.5): the brand pack's light and dark tokens are each held to the contrast rule.
for (const colorScheme of ['light', 'dark'] as const) test(`the app screens have no accessibility violations in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme });
  const csp = watchCspViolations(page);
  await fakeGithub(page).install();
  await connect(page);
  if (colorScheme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);

  await expect(page.getByText('No initiatives yet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
  await expectNoViolations(page); // portfolio, empty, with the Getting started strip

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
    // Rates are never confirmed in this flow, so the Getting started strip is still up, with three steps done.
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

test('the theme menu marks the current theme (§9.1)', async ({ page }) => {
  await fakeGithub(page).install();
  await connect(page);

  // The open theme menu: Radix hides the page behind a modal menu, which axe's aria-hidden-focus flags on every
  // such menu, so only its state is asserted here.
  await page.getByRole('button', { name: 'Theme: System' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
});

test('a saved theme is on the page before first paint, under the strict CSP (§9.1)', async ({ page }) => {
  const csp = watchCspViolations(page);
  await fakeGithub(page).install();
  // Records the root's class at the first animation frame, which comes before the first paint and before the app mounts.
  await page.addInitScript(`
    if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'dark');
    requestAnimationFrame(() => { window.darkAtFirstFrame = document.documentElement.classList.contains('dark'); });
  `);
  await page.goto('/');
  await expect(page.getByLabel('GitHub token')).toBeVisible();
  expect(await page.evaluate('window.darkAtFirstFrame')).toBe(true);
  expect(csp).toEqual([]);

  await connect(page);
  await page.getByRole('button', { name: 'Theme: Dark' }).click();
  await page.getByRole('menuitemradio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Theme: Light' })).toBeVisible();
});
