<!--
AGENTS.md is the instruction file every coding agent shares. This file
imports it so Claude Code loads it in every session (including ones that
can't read AGENTS.md directly, and after a CLAUDE.local.md appears), and
holds only what is specific to Claude Code. Rules for any agent go in
AGENTS.md, not here.
-->
@AGENTS.md

## Claude Code
- Backlog: the `next-slice` skill picks the slice and settles its open
  decisions with the user before implementation. Spec lookups go through
  `.claude/skills/spec-section/scripts/extract.sh <§>` (`--toc` and
  `--find <term>` to locate a section).
- UI smoke pass (Order of work step 5): the `run-initiative-planner`
  skill has the launch, the dev token and what to check.
- Hooks: `block-github-token.sh` blocks file writes and shell commands
  containing a token pattern — a backstop, not a substitute for care;
  `lint-fix.sh` runs `eslint --fix` on each edited `src/` file.
- Keep bulky reference material (design-tool guides, long docs) out of
  the main context: have a subagent read it and report back.
