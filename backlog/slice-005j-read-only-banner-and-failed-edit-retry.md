---
slice_id: "005j"
title: "Read-only banner, automatic recovery, and a failed edit stays in edit"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005g"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail. §3 and §9.9 describe three things a failed sync must do: an app-wide read-only banner with Retry, recovering by itself once sync works again, and a field whose push failed staying in edit with the error and its own Retry, keeping the typed value. 005g deliberately left all three out (its own Flags and compromises names the gap) because they need the one-writer refactor first. Today a failed push is silently dropped: the value stays on screen looking identical to a saved one, nothing retries it, and only the sync indicator (not a banner) shows read-only."
recommended_model: "Claude Opus 5"
model_rationale: "The design is fully settled by review, but the risk is in interleaving: a background retry timer racing a manual Retry click, racing a fresh edit that supersedes both, racing an open conflict on the same path. Each needs a test with a fake clock and a fake repository, written to catch the actual race rather than just the happy path, the same discipline 005g and 005i needed."
spec_sections: ["§3 Storage & sync (Sync behaviour, Sync failures)", "§9.5 Accessibility (Keyboard operability)", "§9.9 Interface states (Read-only banner, Saving, Same-field conflict)", "§10.3 Writing"]
---

# Read-only banner, automatic recovery, and a failed edit stays in edit

## Intent

**Problem statement:** When a push fails today, the write is simply dropped:
the typed value stays on screen looking exactly like a saved field, nothing
ever retries it, and the only sign anything is wrong is the sync indicator's
icon turning read-only — there is no banner, no per-field error, and no way
to retry short of editing the field again and hoping. A user can keep
working for a long time believing changes are saved when they are not.

**Outcome statement:** This slice contributes to the principle that no
change is ever silently lost by making read-only visible everywhere it
happens (an app-wide banner), making recovery need no action when the cause
is transient (automatic retry), and, when a push does fail, leaving the
field showing that it did — with the typed value, the cause, and a way to
retry it.

## Scope

- **Read-only banner (§9.9).** A Warning-coloured banner directly below the
  top bar, on every page, showing the read-only cause and a **Retry**
  button. It cannot be dismissed while read-only, and disappears by itself
  the moment sync recovers. When a conflict is also open, the read-only
  banner sits above `ConflictBanner` — read-only is the umbrella state,
  the conflict is a more specific thing nested under it.
- **Automatic recovery (§3), cause-conditional.** One shared retry loop,
  reusing the pull's existing cadence and tab-visibility gate (§3: only
  while the tab is visible), that fires only for the two causes §3 marks
  "Automatic" — **GitHub unreachable** and **rate limited**. Each tick it
  retries the pull and flushes every currently-failed writer whose cause is
  one of those two. **Access denied** and **process mismatch / dataset
  newer** never auto-retry: the first needs a new token pasted in, the
  second needs a reload, and retrying either in the background can never
  succeed, so it would just loop forever for no benefit and, for a
  revoked token, keep hitting GitHub with it.
- **Banner Retry.** The banner's own Retry button is shown for every cause
  except a rejected token, where Retry can never succeed (§3: paste a new
  token instead). For the other cause that retrying cannot fix (a stale
  write needing a reload) it will fail again with the same message, which
  tells the user what does fix it. It retries the pull and flushes every
  currently-failed writer immediately, the same action the automatic loop
  takes, just not waiting for the next tick.
- **A failed edit stays in edit (§3, §9.5, §9.9).** Wired once into the two
  shared field primitives, `CommitInput` and `PopoverTextField`, so every
  field built on them (percent, amount, text renames, dates, months) gets
  this for free with no per-screen work. A field whose file has a failed,
  unsaved edit at its own path keeps its typed value and shows, in place of
  looking like a normal committed field:
  ```
  Not saved: <cause>.
  [ Retry ]
  ```
  with its own accessible name (e.g. "Retry saving Team FTE %"), so several
  failed fields on one screen are distinguishable to a screen reader. Its
  Retry resends only that field's file. A fresh edit on the field clears
  the failed state at once (the writer already resets `failed` on
  `schedule()`; this surfaces that to the field).
- **A path under an open conflict is never also shown as a failed edit.**
  `ConflictBanner` already owns that path's failure messaging ("Your choice
  was not saved…"); showing both for the same underlying failure would say
  the same thing twice.
- **Button and toggle actions get no inline retry.** Checklist status,
  deactivate/reactivate, and initiative creation have no "edit mode" to
  stay in; a failure there is visible only through the read-only banner.
  (Initiative creation already has its own failure path — the draft page
  stays on the draft — untouched by this slice.)

**Explicitly excluded:** conflicts shown inline under the field rather than
in the top banner (§9.9, backlog tail — the banner is the first step); the
409 retry backoff (§10.3, backlog tail); the entity id in a commit's
trailer line (backlog tail).

## Execution path

1. User triggers: GitHub becomes unreachable while editing a Team FTE %.
2. Data: the push fails after its internal 409-retry loop; the writer
   reports read-only with the "unreachable" cause; the shared recovery loop
   starts ticking every 30 seconds while the tab is visible.
3. UI: the read-only banner appears below the top bar with "Cannot reach
   GitHub; changes are paused." and Retry; the Team FTE % field keeps 80%
   on screen and shows "Not saved: Cannot reach GitHub; changes are
   paused." with its own Retry.
4. User receives: either they click a Retry, or the next automatic tick
   succeeds once GitHub is reachable again — either way the banner and the
   field's message clear themselves, with no further action needed.

## Value

- **Desirable:** People expect to be told, clearly and everywhere, when
  their change did not actually save — not to find out later.
- **Usable:** One mechanism recovers the app by itself when the problem is
  transient, and tells the user exactly what to do when it isn't.
- **Valuable:** Directly closes the "No silent data loss" working rule's
  last real gap (§3): a failed push is now visible and recoverable, not
  quietly discarded.

## Acceptance criteria

- [ ] Given GitHub is unreachable, when a read or write fails, then a
      Warning-coloured banner appears directly below the top bar on every
      page, names the cause, offers Retry, and cannot be dismissed while
      read-only.
- [ ] Given the read-only banner and an open conflict are both showing,
      then the read-only banner is above `ConflictBanner`.
- [ ] Given the cause is "unreachable" or "rate limited", when sync starts
      working again with no user action, then the banner and every failed
      field clear themselves within one retry-loop tick, without a Retry
      click.
- [ ] Given the cause is "access denied" or "process mismatch / dataset
      newer", when time passes with no user action, then nothing
      auto-retries; the banner and any failed field stay exactly as they
      are until a Retry is clicked or the underlying cause is fixed.
- [ ] Given the read-only banner's Retry is clicked, for any cause, then a
      pull is retried immediately and every currently-failed file's writer
      resends its last edit, instead of waiting for the next tick.
- [ ] Given a field's edit fails to save, then that field keeps its typed
      value and shows "Not saved: `<cause>`." with its own Retry button,
      instead of looking identical to a saved field.
- [ ] Given a failed field's Retry is clicked, then only that field's file
      is resent.
- [ ] Given a failed field, when a new edit is typed into it, then its
      failed message and Retry disappear at once.
- [ ] Given two fields whose edits landed in the same failed commit (edited
      inside the same debounce window), then both show the failed state,
      and retrying either resends the same combined edit.
- [ ] Given a field's path is also under an open same-field conflict, then
      that field shows only the conflict banner's message, never the
      failed-edit message as well.
- [ ] Given a checklist status change, a deactivate/reactivate, or a new
      initiative fails, then no inline retry appears on that control; the
      failure is visible only via the read-only banner.
- [ ] Given a screen reader, when the banner or a failed field appears,
      then it is announced (`role="alert"`) and its Retry button has an
      accessible name distinct from any other Retry button on screen.
- [ ] Given the existing writer and pull interleaving tests (005g, 005i),
      when they run against this slice's changes, then every invariant
      they pin other than "a failed write never retries itself" still
      holds; that one test is updated to assert the new automatic-retry
      behaviour instead.

## Flags and compromises

None anticipated. This closes the divergence from §3 that 005g's own Flags
and compromises section named and deliberately deferred.

## Decided in review (pre-implementation)

- **Field layout:** a separate small Retry button, not an inline text link
  (narrower than reusing `Refusal`'s single tinted line, but clearer as a
  distinct action).
- **Field copy:** "Not saved: `<cause>`." — the word "Retry" lives only on
  the button, not repeated in the sentence.
- **Banner stacking:** the read-only banner sits above `ConflictBanner`.
- **Toggle/button actions:** rely on the global banner only; no inline
  retry for checklist status, deactivate/reactivate, or initiative
  creation.
- **Automatic recovery is cause-conditional**, not uniform: only
  "unreachable" and "rate limited" retry themselves in the background,
  matching §3's table exactly. "Access denied" and "process mismatch /
  dataset newer" never auto-retry — only a manual Retry (banner or field),
  which will keep failing with the same message until the real cause is
  fixed (a new token; a reload).
- **The banner's Retry stays uniform** across all four causes (per §9.9's
  literal text): always shown, always clickable, even where it cannot
  succeed until the user does something else — the message itself says
  what that is.
- **Retry granularity:** a field's own Retry resends only its file; the
  banner's Retry resends everything currently failed, plus a pull.
- **No double messaging:** a path under an open same-field conflict is
  never also shown as a failed edit — `ConflictBanner` already owns it.
- **Accessible names:** each Retry button (banner and per-field) gets a
  distinct accessible name, since several can be on screen at once.
