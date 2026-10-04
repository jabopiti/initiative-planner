import { expect, test } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { addPerson, connect, createTeam, loadExampleData } from './support/session';

test('a percent field shows "100" and its % whole, and a keyboard-focused control has the 2 px focus outline', async ({ page }) => {
  await fakeGithub(page).install();
  await connect(page);
  await createTeam(page, 'Platform');
  await addPerson(page, 'Mara Voss');

  await page.goto('/#/teams');
  await page.getByRole('link', { name: 'Platform' }).first().click();
  const add = page.getByRole('combobox', { name: 'Add member' });
  await add.fill('Mara');
  await add.press('ArrowDown');
  await page.getByRole('option', { name: /Mara Voss/ }).click();

  const fte = page.getByRole('spinbutton', { name: /Team FTE %/ });
  await expect(fte).toHaveValue('100');
  const fits = await fte.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  await expect(page.getByText('%', { exact: true }).first()).toBeVisible();

  // One focus ring everywhere (§9.5): an input and a button reached by keyboard share the outline.
  await fte.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(fte).toHaveCSS('outline-width', '2px');
  await expect(fte).toHaveCSS('outline-offset', '2px');
  const menu = page.getByRole('button', { name: 'Actions for Mara Voss in this team' });
  await menu.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCSS('outline-width', '2px');
  await expect(menu).toHaveCSS('outline-offset', '2px');
});

test('an amount field takes a sum, shows what it saves as and has the currency inside it', async ({ page }) => {
  const github = fakeGithub(page);
  await github.install();
  await connect(page);
  await loadExampleData(page);

  await page.goto('/#/initiatives');
  await page.getByRole('link').filter({ hasText: /\S/ }).nth(0).waitFor();
  await page.getByRole('table').getByRole('link').first().click();
  await page.getByRole('button', { name: /^Add cost item to/ }).first().click();

  const amount = page.getByRole('textbox', { name: 'Amount', exact: true });
  await expect(amount.locator('xpath=..')).toContainText('€');
  await page.getByRole('combobox', { name: 'Label' }).fill('Licences');
  await amount.fill('3 × 4k');
  await expect(page.getByText('Saves as €12,000')).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Amount for Licences' })).toHaveValue('12000');
});
