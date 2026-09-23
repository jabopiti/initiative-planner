---
name: spec-section
description: Extract one numbered section (e.g. 5.6, 7.2) from docs/spec.md instead of reading the whole 1700+ line file. Use for any backlog slice's spec_sections frontmatter, or any other §-reference, that needs looking up.
user-invocable: false
---

# spec-section

`docs/spec.md` is authoritative but long. AGENTS.md's backlog workflow says
to read only the sections a slice's `spec_sections` frontmatter cites — not
the whole file. This skill does that lookup mechanically.

## Usage

For each `§N` or `§N.M` reference, run (works from any directory — it
resolves the repo root via `git rev-parse --show-toplevel`):

```bash
.claude/skills/spec-section/scripts/extract.sh 5.6
```

It prints that section's heading through the end of its content (including
nested subsections), stopping right before the next heading at the same or
a shallower level. If a slice cites several sections, call it once per
section rather than reading the file directly — each call is cheap.

If the script reports no matching heading (exit 1), the frontmatter's
section number may not match current spec numbering — fall back to
`grep -n "^#" docs/spec.md` to find the right heading.
