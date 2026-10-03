import { expect, test } from '@playwright/test';
import { fakeGithub } from './support/fakeGithub';
import { addPerson, connect, createTeam } from './support/session';

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
