---
slice_id: "037"
title: "Retry a rejected write with a short backoff"
type: "capability"
status: "valid"
criteria_failures: []
depends_on: ["005g"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Promoted from the backlog tail (Retry backoff, §10.3). A 409 retry re-reads the file and writes again at once; §10.3 asks for a short backoff to stay inside GitHub's request limits."
recommended_model: "Claude Sonnet 5"
model_rationale: "One place to change (the file writer), with an injectable delay so the timing is tested on a fake clock; the care is not breaking 005g/005j's interleaving invariants."
spec_sections: ["§10.3 Writing", "§3 Storage & sync (Sync failures)"]
---

# Retry a rejected write with a short backoff

## Intent

**Problem statement:** When two users save the same file at once, the loser's
write is rejected with a 409 and retried immediately, up to three times. Two
busy clients can collide again on each retry, and a burst of instant retries
spends GitHub's content-creation limit (80 per minute) for nothing.

**Outcome statement:** Each retry after a 409 waits a short, growing, jittered
delay (§10.3), so colliding clients spread out and the tool stays well inside
GitHub's limits.

## Scope

- **Delays.** Before retry 1: 0.5 s; retry 2: 1 s; retry 3: 2 s; each ±20%
  random jitter. After the third, the conflict flow (§3) as today.
- **Injectable.** The writer takes its delay function (and random source)
  from its options; tests use a fake clock and fixed jitter; the app uses real
  timers.
- **Interleaving (005g, 005j).** A newer edit scheduled during a backoff is
  folded into the retry (not a separate write); only one write in flight per
  file; the read-only recovery loop doesn't also retry the same file.

## Execution path

1. Two clients save `people.json` together; one gets 409.
2. It re-reads, merges (§10.5) and waits ~0.5 s before writing again.
3. It succeeds; no conflict shown.

## Value

- **Desirable:** Fewer spurious conflicts under concurrent use.
- **Usable:** Invisible.
- **Valuable:** Keeps the tool inside GitHub's limits (§10.3).

## Acceptance criteria

- [x] Given three consecutive 409s (fake repository, fake clock), then the
      retries start after 0.5 s, 1 s and 2 s (±20%), and the fourth outcome is
      the conflict flow.
- [x] Given jitter fixed at +10%, then the delays are exactly 0.55, 1.1 and
      2.2 s.
- [x] Given a new edit during a backoff, then it is included in the retried
      write, and only one write is in flight.
- [x] Given 005g's and 005j's interleaving tests, then they pass unchanged.
- [x] Given the app, then no test waits on real time for backoff.

## Flags and compromises

None.

## Decided in review (pre-implementation)

- **Delays:** 0.5 s, 1 s, 2 s, ±20% jitter.
- **Wait position:** after the re-read and merge, just before the next put; the first attempt has no wait. Applies to the 409 retry and to the retry after a "file already exists" 422 while creating.
- **Options:** `FileWriterOptions` gains `delay(ms)` and `random()`; defaults are `setTimeout` and `Math.random`. Jitter is `1 + (random() * 2 - 1) * 0.2`.
- **Queue:** the wait runs outside the global write queue, so other files aren't held up.
- **Newer edit during a backoff:** after the wait, pending is three-way-merged onto the write being retried and cleared; its notes join the commit message; one write goes out.
- **Recovery loop:** the pull path already leaves a file alone while it saves; a test pins it.
- **Tests:** `src/test/setup.ts` makes the default delay instant, so 005g/005j tests pass unchanged; new tests inject a recording fake delay and fixed jitter.
- No new copy; the final "Could not save after several retries — please retry." is unchanged.
