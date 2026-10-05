import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { addPerson, connect, createInitiative, createTeam, enterToken, FAKE_TOKEN, loadExampleData, unlockSettings, watchCspViolations } from './support/session';

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

  await expect(page.getByRole('heading', { name: /^Welcome to/ })).toBeVisible();
  await expectNoViolations(page); // portfolio, empty, with the welcome card (no team yet)

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

  // The period picker open, with a range previewed (§9.11).
  const start = page.getByRole('textbox', { name: / start date$/ }).first();
  await start.click();
  await start.fill('01.09.2026');
  const picker = page.getByRole('dialog', { name: / period$/ });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: '2 months' }).click();
  await expect(picker.getByText(/· 2 months/)).toBeVisible();
  await expectNoViolations(page); // period picker
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();

  // A hash navigation is same-document, so wait for something only the target screen shows before scanning.
  const section = (label: string) => () =>
    page.getByRole('navigation', { name: 'Settings sections' }).locator('[aria-current="page"]', { hasText: label });
  const screens: [route: string, ready: () => Locator][] = [
    ['/#/initiatives', () => page.getByRole('heading', { level: 1, name: 'Initiatives' })],
    // The portfolio has no nav item of its own: it is the screen where Initiatives is no longer the current page.
    // Rates are never confirmed in this flow, so Getting started is still up, three steps done: the chip in the toolbar row.
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

test('the populated screens and open panels have no accessibility violations', async ({ page }) => {
  const csp = watchCspViolations(page);
  await fakeGithub(page).install();
  await connect(page);
  await loadExampleData(page);
  await expectNoViolations(page); // the populated portfolio

  await page.goto('/#/initiatives');
  await expect(page.getByRole('link', { name: 'Checkout Redesign' })).toBeVisible();
  await expectNoViolations(page); // the populated initiatives table

  await page.getByRole('link', { name: 'Checkout Redesign' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout Redesign', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Gate \/ Checklist/ })).toBeVisible();
  await expectNoViolations(page); // an initiative with phases, allocations and a frozen earlier gate

  await page.goto('/#/initiatives/new');
  await expect(page.getByLabel('Initiative name')).toBeVisible();
  await expectNoViolations(page); // the new-initiative draft

  await page.goto('/#/teams');
  await page.getByRole('link', { name: 'Platform' }).first().click();
  await expect(page.getByRole('heading', { name: 'Platform', level: 1 })).toBeVisible();
  const capacity = page.getByRole('region', { name: 'Capacity', exact: true });
  await expect(capacity.getByRole('table')).toBeVisible();
  await expectNoViolations(page); // team detail with its capacity grid
  await capacity.getByRole('button', { name: /^All months for / }).first().click();
  await expect(page.getByRole('region', { name: 'Capacity detail' })).toBeVisible();
  await expectNoViolations(page); // the capacity detail under the grid

  await page.goto('/#/people');
  await page.getByRole('button', { name: 'Mara Voss', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoViolations(page); // the person panel
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('combobox').fill('Mara');
  await expect(page.getByRole('option').first()).toBeVisible();
  await expectNoViolations(page); // the search overlay with results
  await page.keyboard.press('Escape');

  await page.goto('/#/settings/countries');
  await unlockSettings(page);
  await expect(page.getByRole('button', { name: 'Lock', exact: true })).toBeVisible();
  await expectNoViolations(page); // the unlocked Countries section
  expect(csp).toEqual([]);
});

test('Cancelled and Closed initiatives and their frozen strip have no accessibility violations', async ({ page }) => {
  await fakeGithub(page).install();
  await connect(page);
  await loadExampleData(page);

  // Cancelled: the Actions menu, then the strip under the header.
  await page.goto('/#/initiatives');
  await page.getByRole('link', { name: 'Fraud Detection Upgrade' }).click();
  await expect(page.getByRole('heading', { name: 'Fraud Detection Upgrade', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Cancel initiative' }).click();
  await expect(page.getByText('Cancelled.')).toBeVisible();
  await expectNoViolations(page);

  // Closed: Checkout Redesign is in Development; passing G3 and then G4 closes it.
  await page.goto('/#/initiatives');
  await page.getByRole('link', { name: 'Checkout Redesign' }).click();
  for (const gate of [
    ['Acceptance testing passed', 'Security review completed', 'Rollout plan approved'],
    ['Hypercare period completed', 'Lessons learned documented'],
  ]) {
    for (const item of gate) {
      await page.getByRole('radiogroup', { name: `Status of "${item}"` }).getByRole('radio', { name: 'Complete', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Pass gate' }).click();
  }
  await expect(page.getByText(/Closed after G4\./)).toBeVisible();
  await expectNoViolations(page);

});

test('the read-only banner and a same-field conflict have no accessibility violations', async ({ page }) => {
  const github = fakeGithub(page);
  await github.install();
  await connect(page);
  await createTeam(page, 'Platform');
  await createInitiative(page, 'Checkout Redesign', 'Platform');
  await expect.poll(() => github.paths('initiatives/').length).toBe(1);
  const [path] = github.paths('initiatives/');

  // The conflict block under the field, with Keep theirs and Use mine.
  github.edit<{ name: string }>(path, (initiative) => ({ ...initiative, name: 'Checkout Rebuild' }));
  await page.getByLabel('Initiative name').fill('Checkout Revamp');
  await page.getByLabel('Initiative name').blur();
  await expect(page.getByRole('button', { name: 'Use mine' })).toBeVisible();
  await expectNoViolations(page);
  await page.getByRole('button', { name: 'Keep theirs' }).click();
  await expect(page.getByRole('button', { name: 'Use mine' })).toBeHidden();

  // The read-only banner once GitHub stops accepting the token, after its own check has finished.
  await expect.poll(() => github.read<{ name: string }>(path)?.name).toBe('Checkout Rebuild');
  github.rejectToken(FAKE_TOKEN);
  await page.goto('/#/teams');
  await page.getByRole('button', { name: 'New team' }).click();
  await page.getByPlaceholder('Team name').fill('Growth');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: /Create a new token/ })).toBeVisible();
  await expectNoViolations(page);
});
