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
change_summary: "Added from the post-build review of the implementation against the spec (slices 001 to 041). Review findings: the Connect screen unmounts before showing the classic-token warning, does not check a pasted token, and the 'cannot see' message omits the repository."
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
- A classic token connects, then the warning stays visible until dismissed
  (inline, with the link), not a toast.
- `TOKEN_CHECK_MESSAGES` take `owner/repo`; used by the Connect screen, the
  banner and the Replace field.
- An app-level test of the classic path, not only the stubbed screen.

## Acceptance criteria

- [ ] Given a token pasted, then it is checked without pressing Connect.
- [ ] Given a classic token, then the app opens and shows the warning with the
      fine-grained link until dismissed.
- [ ] Given a token that cannot see the repository, then the message reads
      "This token can't see owner/repo." (copy per §5.10).
- [ ] Given each outcome of the §5.10 table, then an App-level test asserts
      its message and whether the app opens.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.

## Open decisions

- Where the classic-token warning lives after connecting (a banner under the
  top bar, recommended, or a one-time dialog), shown as a mockup.
