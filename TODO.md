# TODO

## For Bo

- **Live verification of slice 003 (Connect, create a team, create a
  named initiative).** Automated tests mock the GitHub Contents API — no
  real commits are made by the build. Once this is deployed (or running
  locally via `npm run dev`), do a real pass against
  `jabopiti/initiative-planner`:
  1. Paste a real fine-grained token on the Connect screen and confirm
     "Connected as `<you>`" leads to the Portfolio.
  2. Create a team by name; confirm it appears as a card on Teams and as
     a real commit on the `data` branch.
  3. Create an initiative (name + team); confirm its page opens and it
     appears on the Portfolio board in the first phase's column, again as
     a real commit on `data`.
  4. Try the classic-token, wrong-repo, read-only, and invalid-token
     paths from §5.10's outcomes table if you have tokens handy to try
     them with — the automated tests cover the message logic, but a live
     token against real GitHub is the only way to confirm GitHub's actual
     responses still match what §5.10 assumes.
  5. **Pending-approval especially** (`src/auth/validateToken.ts`): this is
     the one outcome slice 002's spike never touched (it used a classic
     `gh` CLI token, not a fine-grained token awaiting org approval), so
     the 403-message sniffing this build does (`/pending|approv/i`) is a
     best guess at GitHub's real wording, not a confirmed one. If you or
     someone in an org you administer can generate a fine-grained token
     and leave it pending, that's the one to test with.
  This also serves as the delivery gate's "demonstrated to an external
  stakeholder" step.
  6. **Token-creation link prefill** (`src/auth/tokenCreationUrl.ts`): only
     `name`, `description` and `target_name` are documented GitHub query
     params for the fine-grained token page. Expiry (one year) and the
     Contents: Read-and-write permission — both called for in §5.10 step
     1 — have no known query-param prefill, so that button currently only
     prefills two of the four fields §5.10 asks for. Worth re-checking
     GitHub's actual page for newer prefill support next time this is
     touched.
