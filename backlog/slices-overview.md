# Slice overview

The open backlog. `docs/spec.md` is authoritative; a slice says which part
of it to build next, and its `spec_sections` frontmatter says which
sections to read. AGENTS.md ("Working from the backlog") says when a slice
is done and what happens to its file.

## Open slices

| ID | Title | Depends on | Note |
|---|---|---|---|
| 066 | Brand pack in its own folder | | §2, §10.7: fork edits only `brand/` |
| 069 | Brand pack logo and favicon | 066 | §2, §9.1: logo and favicon in `brand/` |
| 067 | Brand pack build checks | 066 | §10.7: bands, process definition, example dataset |

## Delivered slices

Slices 001 to 065 are delivered; their files and the full build-time index
are archived in `backlog/done/`, which agents don't read unless the user
asks (AGENTS.md).

## Adding a slice

New work goes in `backlog/` as `slice-<id>-<name>.md`, in the same
frontmatter format as the other slice files, numbered after the highest
id in `backlog/` and `backlog/done/`, and gets a row in the table above.
