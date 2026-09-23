---
name: next-slice
description: Pick up the next backlog slice — finds the slice whose dependencies are done but that isn't itself done yet, then reports its recommended_model and spec_sections. Use when the user asks what's next, says to pick up the next slice, or starts backlog work without naming a specific slice.
---

# next-slice

AGENTS.md: one backlog slice at a time, reading only its `spec_sections`
frontmatter — not the whole spec. This skill automates picking that slice.

## Steps

1. Run the bundled script. It parses every `backlog/slice-*.md`'s
   frontmatter and cross-checks git history for what's already built:

   ```bash
   .claude/skills/next-slice/scripts/find-eligible.sh
   ```

   It prints every slice that's `status: valid`, not `superseded_by`
   another, and whose every `depends_on` entry is already done — "done"
   meaning a commit subject starts with `Slice <id>:` (this repo's
   convention; see `git log --oneline`). A `type: spike` slice can ship
   with no such commit — its output may be a finding or code folded into
   a later commit rather than its own. If the script lists a spike as
   not-done but a later slice that depends on it is clearly done, treat
   the spike as done too rather than blocking on it.

2. **Exactly one eligible slice** → that's the one. **More than one**
   (e.g. an inserted slice like `003b` that sits outside the main chain in
   `backlog/slices-overview.md`) → don't guess, ask the user which to do
   next.

3. Report before starting: slice id and title, `depends_on`,
   `spec_sections`, and `recommended_model` + `model_rationale` (they may
   want to switch models via `/model` — don't switch it yourself).

4. Load only the cited spec sections — call `spec-section`'s script per
   section instead of reading `docs/spec.md` directly:

   ```bash
   .claude/skills/spec-section/scripts/extract.sh 5.6
   ```

5. Verify against the slice's acceptance criteria before marking it
   complete — per AGENTS.md, those are the definition of done.
