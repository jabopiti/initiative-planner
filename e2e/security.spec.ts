import { expect, test, type Page } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { addPerson, connect, createInitiative, createTeam, FAKE_TOKEN } from './support/session';

// §10.8 Behaviour, §10.9: the token never leaves its header, every request goes to the configured host, and
// user-entered text is escaped.

const APP_ORIGIN = 'http://localhost:4173';
const GITHUB_ORIGIN = 'https://api.github.com'; // the brand pack's apiBaseUrl

/** Everything the page says about itself while a flow runs: console lines, uncaught errors, and every request's origin. */
function watch(page: Page) {
  const said: string[] = [];
  const origins = new Set<string>();
  page.on('console', (msg) => said.push(msg.text()));
  page.on('pageerror', (error) => said.push(`${error.message}\n${error.stack ?? ''}`));
  page.on('request', (request) => {
    const { protocol, origin } = new URL(request.url());
    if (protocol === 'http:' || protocol === 'https:') origins.add(origin);
  });
  return { said, origins };
}

test('the token is sent only to the configured GitHub host and never reaches the console, an error, the page or a commit', async ({ page }) => {
  const github = fakeGithub(page);
  const seen = watch(page);
  await github.install();
  await connect(page);
  await createTeam(page, 'Platform');
  await addPerson(page, 'Mara Voss');
  await createInitiative(page, 'Checkout Redesign', 'Platform');
  await expect.poll(() => github.paths('initiatives/').length).toBe(1);

  // A refused token is the error path most likely to echo it: the banner, the console and the thrown error must not.
  github.rejectToken(FAKE_TOKEN);
  await page.goto('/#/teams');
  await page.getByRole('button', { name: 'New team' }).click();
  await page.getByPlaceholder('Team name').fill('Growth');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Read-only · Access denied')).toBeVisible();

  expect([...seen.origins].sort()).toEqual([APP_ORIGIN, GITHUB_ORIGIN]);
  expect(seen.said.filter((line) => line.includes(FAKE_TOKEN))).toEqual([]);
  expect(await page.locator('body').innerText()).not.toContain(FAKE_TOKEN);
  expect(await page.locator('html').innerHTML()).not.toContain(FAKE_TOKEN);
  expect(page.url()).not.toContain(FAKE_TOKEN);
  for (const path of github.paths()) expect(JSON.stringify(github.read(path))).not.toContain(FAKE_TOKEN);
  for (const write of github.writes) expect(write.message).not.toContain(FAKE_TOKEN);
});

test('names, descriptions and notes with markup are shown as text and never run', async ({ page }) => {
  const github = fakeGithub(page);
  await github.install();
  await page.addInitScript('window.pwned = 0;');
  // `onerror` runs if the <img> is ever created; the other two run on load and on click.
  const payloads = {
    team: '<img src=x onerror="window.pwned++">Team',
    person: '<svg onload="window.pwned++">Person</svg>',
    initiative: '"><script>window.pwned++</script>Initiative',
    description: '<a href="javascript:window.pwned++" id="evil">Description</a>',
    note: '<b onmouseover="window.pwned++">Note</b>',
  };
  await connect(page);
  await createTeam(page, payloads.team);
  await addPerson(page, payloads.person);
  await createInitiative(page, payloads.initiative, payloads.team);
  await page.getByLabel('Description').fill(payloads.description);
  await page.getByLabel('Description').blur();
  await page.getByRole('radiogroup', { name: 'Status of "Problem statement validated"' }).getByRole('radio', { name: 'Tentative' }).click();
  await page.getByLabel('Why tentative?').fill(payloads.note);
  await page.getByRole('button', { name: 'Save' }).click();

  // The text is on the page exactly as typed, and no element was made from it.
  await expect(page.getByRole('heading', { name: payloads.initiative, level: 1 })).toBeVisible();
  await expect(page.getByLabel('Description')).toHaveValue(payloads.description);
  await expect(page.locator('img[src="x"], svg[onload], #evil, b[onmouseover], [onerror]')).toHaveCount(0);
  await page.goto('/#/teams');
  await expect(page.getByRole('link', { name: payloads.team })).toBeVisible();
  await page.goto('/#/people');
  await expect(page.getByRole('button', { name: payloads.person, exact: true })).toBeVisible();
  await page.goto('/#/initiatives');
  await expect(page.getByRole('link', { name: payloads.initiative })).toBeVisible();
  expect(await page.evaluate('window.pwned')).toBe(0);
});
