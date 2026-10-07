---
slice_id: "049"
title: "Connect screen: check on paste, show the classic-token warning, name the repository"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["040"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings: the Connect screen unmounts before showing the classic-token warning, does not check a pasted token, and the 'cannot see' message omits the repository. Backlog reshuffle (3 Oct 2026): took over the UX review's F26 from 058 (same screen, same message table), as decided with the user from mockups on 2 Oct 2026 (cause and one link, recorded in §5.10)."
recommended_model: "Claude Sonnet 5"
model_rationale: "Contained UI changes to one screen and one message table; mirror ReplaceTokenField."
spec_sections: ["§5.10 Connect screen", "§3 Storage & sync (Authentication)", "§9.9 Interface states"]
---

# Connect screen: check on paste, show the classic-token warning, name the repository

## Intent

**Problem statement:** §5.10 says a pasted token is checked immediately and
lists an outcome per check result. In the real app the screen calls
`onConnected` in the same tick as it sets the result, so it unmounts and the
classic-token warning ("reaches all your repositories … create a fine-grained
one") is unreachable; `ConnectScreen.test.tsx` passes only because it stubs
`onConnected`. Paste is not handled (the Replace-token field handles it).
"This token can't see the repository" omits the repository name §5.10 gives.

**Outcome statement:** The Connect screen behaves as the §5.10 table says, in
the real app, and agrees with the Replace-token field.

## Scope

- `onPaste` checks at once, as `ReplaceTokenField` does.
- F26 (from 058): the remember option is a shadcn Checkbox with its Label;
  the 401 message names the likely cause and links "Create a new token"
  (§5.10).
- A classic token connects, then the warning stays visible until dismissed
  (inline, with the link), not a toast.
- `TOKEN_CHECK_MESSAGES` take `owner/repo`; used by the Connect screen, the
  banner and the Replace field.
- An app-level test of the classic path, not only the stubbed screen.

## Acceptance criteria

- [x] Given a token pasted, then it is checked without pressing Connect.
- [x] Given a classic token, then the app opens and shows the warning with the
      fine-grained link until dismissed.
- [x] Given a token that cannot see the repository, then the message reads
      "This token can't see owner/repo." (copy per §5.10).
- [x] Given a rejected token (401), then the error names the likely cause
      and links "Create a new token".
- [x] Given each outcome of the §5.10 table, then an App-level test asserts
      its message and whether the app opens.

## Flags and compromises

None.

## Decided in review (pre-implementation)

- The classic-token warning is a banner under the top bar (mockup option A,
  4 Oct 2026): "Connected as <user> — a classic token reaches all your
  repositories. Create a fine-grained one." with the link (new tab) and a
  Dismiss button. It survives a reload until dismissed: the flag is stored
  beside the token with its lifetime (session, or IndexedDB when remembered)
  and cleared by Dismiss or by replacing the token. The Replace-token field
  raises the same banner instead of its toast.
- Paste checks and connects at once with the Remember me state at that
  moment; the checkbox stays where it is, and typing then Connect still works.
- The 401 text is §5.10's full sentence plus a "Create a new token" link; the
  read-only banner uses the same text and link (replacing its own hint).
- `TOKEN_CHECK_MESSAGES` take `owner/repo` for "This token can't see
  owner/repo. Create it with access to that repository."

## Open decisions

None.
