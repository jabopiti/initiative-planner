// Render a mockup (a local HTML file or a URL such as the dev server) to a
// PNG. Fallback for mockups when an inline show_widget visual won't do
// (see SKILL.md, Settle). Uses the repo's @playwright/test Chromium.
//
// Usage: node screenshot.mjs <page.html|url> <out.png> [width] [--dark]
//   width defaults to 1280 (desktop-first, §1 Non-goals); --dark renders
//   with prefers-color-scheme: dark.
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const dark = args.includes('--dark');
const [input, out, width = '1280'] = args.filter((a) => a !== '--dark');
if (!input || !out) {
  console.error('usage: node screenshot.mjs <page.html|url> <out.png> [width] [--dark]');
  process.exit(1);
}

const url = /^https?:\/\//.test(input) ? input : pathToFileURL(resolve(input)).href;

async function launch() {
  try {
    return await chromium.launch();
  } catch (error) {
    // A pinned Playwright version can differ from the pre-installed browser.
    const fallback = '/opt/pw-browsers/chromium';
    if (existsSync(fallback)) return chromium.launch({ executablePath: fallback });
    throw error;
  }
}

const browser = await launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(width), height: 800 },
    deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light',
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
