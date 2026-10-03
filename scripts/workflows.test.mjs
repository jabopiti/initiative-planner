import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// §10.8 Pipeline: workflow actions are pinned to a commit, and a workflow has only the permissions it needs.
// Vitest runs from the repository root.
const dir = join(process.cwd(), '.github/workflows');
const workflows = readdirSync(dir)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));

describe('the GitHub workflows (§10.8 Pipeline)', () => {
  it('finds the workflows', () => {
    expect(workflows.map((w) => w.name)).toEqual(expect.arrayContaining(['ci.yml', 'deploy.yml']));
  });

  it.each(workflows)('$name pins every action to a full commit SHA', ({ text }) => {
    const unpinned = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]).filter((ref) => !ref.startsWith('./') && !/@[0-9a-f]{40}$/.test(ref));
    expect(unpinned).toEqual([]);
  });

  it.each(workflows)('$name declares its permissions at the top, not the repository default', ({ text }) => {
    expect(text).toMatch(/^permissions:/m);
    expect(text).not.toMatch(/^permissions:\s*write-all/m);
  });
});
