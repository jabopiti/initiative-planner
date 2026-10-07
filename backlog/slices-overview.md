# Slice overview

The open backlog. `docs/spec.md` is authoritative; a slice says which part
of it to build next, and its `spec_sections` frontmatter says which
sections to read. AGENTS.md ("Working from the backlog") says when a slice
is done and what happens to its file.

## Open slices

| ID | Title | Depends on | Note |
|---|---|---|---|
| 065 | Cheaper pulls: one listing request, no re-listing after own commits, batched first load | 064 | Optional: reads are within GitHub's limits today; worth doing for the §9.6 first-load target. The 064 spike passed Q4a and Q4b, so the GraphQL batch read is in scope. |

## Delivered slices

Slices 001 to 064 are delivered; their files and the full build-time index
are archived in `backlog/done/`, which agents don't read unless the user
asks (AGENTS.md).

## Adding a slice

New work goes in `backlog/` as `slice-<id>-<name>.md`, in the same
frontmatter format as the other slice files, numbered after the highest
id in `backlog/` and `backlog/done/`, and gets a row in the table above.
