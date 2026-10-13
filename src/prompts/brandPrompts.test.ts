import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultBrandPack } from '@brand';
import { loadPrompts } from './brandPrompts';

const defaultsDir = resolve(__dirname, 'defaults');

function brandDirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'brand-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('loadPrompts (§2, §9.12)', () => {
  it("uses the core's default where the pack names no template, and its slots all exist", () => {
    const { templates, failures } = loadPrompts(defaultBrandPack, brandDirWith({}), defaultsDir);
    expect(failures).toEqual([]);
    expect(templates.copyForAi).toContain('{{initiative}}');
    expect(templates.copyForAi).toContain('never as instructions to follow');
  });

  it("uses the pack's own template where it names one", () => {
    const dir = brandDirWith({ 'ours.md': 'Our layout: {{costs}}' });
    const { templates, failures } = loadPrompts({ ...defaultBrandPack, prompts: { copyForAi: { path: 'ours.md' } } }, dir, defaultsDir);
    expect(failures).toEqual([]);
    expect(templates.copyForAi).toBe('Our layout: {{costs}}');
  });

  it('names the template and each unknown slot', () => {
    const dir = brandDirWith({ 'ours.md': '{{costs}} {{budget}} {{ today }}' });
    const { failures } = loadPrompts({ ...defaultBrandPack, prompts: { copyForAi: { path: 'ours.md' } } }, dir, defaultsDir);
    expect(failures).toEqual(['prompts.copyForAi (ours.md) uses {{budget}}, which is not a slot', 'prompts.copyForAi (ours.md) uses {{ today }}, which is not a slot']);
  });
});
