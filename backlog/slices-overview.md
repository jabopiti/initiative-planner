# Slice overview

The open backlog. `docs/spec.md` is authoritative; a slice says which part
of it to build next, and its `spec_sections` frontmatter says which
sections to read. A slice is done once a `Slice <id>:` commit is on `main`
(`.claude/skills/next-slice/scripts/find-eligible.sh` reads that from git).

## Open slices

| ID | Title | Depends on | Note |
|---|---|---|---|
| 065 | Cheaper pulls: one listing request, no re-listing after own commits, batched first load | 064 | Optional: reads are within GitHub's limits today; worth doing for the §9.6 first-load target. The 064 spike passed Q4a and Q4b, so the GraphQL batch read is in scope. |

## Delivered slices

Slices 001 to 064 were delivered between 22 September and 7 October 2026
(001 and 002 retired as spikes, 051 merged into 042). Their files, the full
index, the dependency chain and the history of mid-flight changes are in
`backlog/done/`. The spec holds every decision they settled.

**Don't read `backlog/done/` unless the user asks for it.** It describes
how the app was built, step by step; old acceptance criteria describe
screens later slices changed, so they mislead as a description of today's
app. `.ignore` keeps it out of default ripgrep searches; search it by
naming the path.

## Adding a slice

New work goes in `backlog/` as `slice-<id>-<name>.md`, in the frontmatter
format of `slice-065-cheaper-pulls.md`, numbered after the last id (066
next), and gets a row in the table above. When it ships, move its file to
`backlog/done/` and its row out of the table.
