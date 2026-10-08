import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { brandColoursPlugin } from './brandColoursPlugin';
import { defaultBrandPack } from '@brand';

const ctx = {
  error: (msg: string): never => {
    throw new Error(msg);
  },
};
const brandDir = resolve(__dirname, '../../brand');
const call = (hook: unknown, ...args: unknown[]) => (hook as (...a: unknown[]) => unknown).call(ctx, ...args);

describe('brandColoursPlugin (§9.5, §10.7)', () => {
  it('serves the generated stylesheet as virtual:brand-colours.css', () => {
    const plugin = brandColoursPlugin(defaultBrandPack, brandDir);
    const id = call(plugin.resolveId, 'virtual:brand-colours.css') as string;
    expect(call(plugin.resolveId, './other.css')).toBeUndefined();
    expect(call(plugin.load, id)).toContain('--surface-page: oklch(0.975 0.002 286);');
    expect(call(plugin.load, '/src/index.css')).toBeUndefined();
  });

  it('lets the default pack build', () => {
    expect(() => call(brandColoursPlugin(defaultBrandPack, brandDir).buildStart)).not.toThrow();
  });

  it('stops the build on a failing pair, naming the token', () => {
    const colours = { ...defaultBrandPack.colours, metText: { ...defaultBrandPack.colours.metText, light: 'oklch(0.627 0.17 149.2)' } };
    expect(() => call(brandColoursPlugin({ ...defaultBrandPack, colours }, brandDir).buildStart)).toThrow(/Brand pack:\n {2}metText \(light\) on surfacePage is \d\.\d\d:1, needs 4\.5:1/);
  });

  it('stops the build when a typeface file is missing from the brand folder (§10.7)', () => {
    const typeface = { ...defaultBrandPack.typeface, files: [{ path: 'fonts/missing.woff2', unicodeRange: 'U+0000-00FF' }] };
    expect(() => call(brandColoursPlugin({ ...defaultBrandPack, typeface }, brandDir).buildStart)).toThrow(/typeface file fonts\/missing\.woff2 not found/);
  });

  it('stops the build on overlapping approval bands, with the colour and font problems (§7.4, §10.7)', () => {
    const [light, standard, elevated] = defaultBrandPack.approvalTracks;
    const approvalTracks = [{ ...light, upperBound: 60_000 }, standard, elevated];
    expect(() => call(brandColoursPlugin({ ...defaultBrandPack, approvalTracks }, brandDir).buildStart)).toThrow(/Brand pack:\n {2}approvalTracks\[light\] overlaps approvalTracks\[standard\]/);
  });

  it('serves the font files from the build itself, never a third party (§10.9)', () => {
    const plugin = brandColoursPlugin(defaultBrandPack, brandDir);
    call(plugin.configResolved, { root: resolve(__dirname, '../..') });
    const css = call(plugin.load, call(plugin.resolveId, 'virtual:brand-colours.css')) as string;
    expect(css).toContain("url('/brand/fonts/geist-latin-wght-normal.woff2')");
    expect(css).not.toMatch(/https?:/);
  });

  it('stops the build when the logo or favicon file is missing, naming it (§2)', () => {
    const pack = { ...defaultBrandPack, logo: { path: 'missing-logo.svg' }, favicon: { path: 'missing-favicon.ico' } };
    expect(() => call(brandColoursPlugin(pack, brandDir).buildStart)).toThrow(/logo missing-logo\.svg not found[\s\S]*favicon missing-favicon\.ico not found/);
  });

  it("puts the pack's page title and favicon into the page, and serves the logo from the build (§2, §10.9)", () => {
    const plugin = brandColoursPlugin({ ...defaultBrandPack, pageTitle: 'Plans & <Bets>' }, brandDir);
    call(plugin.configResolved, { root: resolve(__dirname, '../..') });
    const handler = (plugin.transformIndexHtml as { handler: (html: string) => string }).handler;
    const html = handler('<head>\n<title>Initiative Planner</title>\n</head>');
    expect(html).toContain('<link rel="icon" href="/brand/favicon.svg" />');
    expect(html).toContain('<title>Plans &amp; &lt;Bets></title>');
    expect(call(plugin.load, call(plugin.resolveId, 'virtual:brand-assets'))).toContain("from '/brand/logo.svg'");
  });

  it('keeps a "$&" in the page title literal, and refuses an index.html without a title (§2)', () => {
    const plugin = brandColoursPlugin({ ...defaultBrandPack, pageTitle: 'Plans $& Bets' }, brandDir);
    call(plugin.configResolved, { root: resolve(__dirname, '../..') });
    const handler = (plugin.transformIndexHtml as { handler: (html: string) => string }).handler;
    expect(handler('<head><title>x</title></head>')).toContain('<title>Plans $&amp; Bets</title>');
    expect(() => handler('<head></head>')).toThrow(/no <title>/);
  });
});
