import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrandPack } from '../brand/types';
import { PROMPT_KINDS, unknownSlots, type PromptKind } from './template';

export interface LoadedPrompts {
  templates: Record<PromptKind, string>;
  /** The files read, so the dev server reloads when one changes. */
  files: string[];
  failures: string[];
}

/**
 * Each prompt's template (§2, §9.12): the brand pack's Markdown file where it names one, the core's default otherwise.
 * A missing file, or a `{{…}}` that is not a slot, is a failure naming the prompt, the file and the slot, which the
 * build refuses like any invalid brand pack. Node only: the build plugin reads the files and hands the app the text.
 */
export function loadPrompts(brand: BrandPack, brandDir: string, defaultsDir: string): LoadedPrompts {
  const templates = {} as Record<PromptKind, string>;
  const files: string[] = [];
  const failures: string[] = [];
  for (const [kind, defaultFile] of Object.entries(PROMPT_KINDS) as [PromptKind, string][]) {
    const own = brand.prompts?.[kind]?.path;
    const file = own ? resolve(brandDir, own) : resolve(defaultsDir, defaultFile);
    const where = own ? `prompts.${kind} (${own})` : `the default ${kind} prompt (${defaultFile})`;
    if (!existsSync(file)) {
      failures.push(`${where} not found${own ? ` in ${brandDir}` : ''}`);
      templates[kind] = '';
      continue;
    }
    files.push(file);
    templates[kind] = readFileSync(file, 'utf8');
    for (const slot of unknownSlots(templates[kind])) failures.push(`${where} uses {{${slot}}}, which is not a slot`);
  }
  return { templates, files, failures };
}
