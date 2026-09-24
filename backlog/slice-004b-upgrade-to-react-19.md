---
slice_id: "004b"
title: "Upgrade to React 19"
type: "spike"
status: "valid"
criteria_failures: []
depends_on: ["004"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Inserted after slice 004 shipped: React 19 is stable, and the shadcn Input only accepts refs from React 19 on, which breaks the existing focus() calls."
recommended_model: "Claude Sonnet 5"
model_rationale: "A dependency bump with a small, well-documented set of breaking changes; the work is mostly checking that every library in the stack supports 19 and letting the test suite find what broke."
spec_sections: ["§10.1 Framework and UI foundation"]
---

# Upgrade to React 19

## Intent

**Problem statement:** The app runs React 18.3. The shadcn `Input` is a
plain function component, which only receives `ref` as a prop from React
19 on, so the existing `inputRef.focus()` calls in `TeamsOverview` and
`NewInitiativeControl` silently do nothing. Staying behind also means
every later slice is built against a version that is a major release old.

**Outcome statement:** This slice contributes to the tool's foundation by
moving the whole app to the current stable React before more screens are
built on it, and by making refs work on the shadcn inputs.

## Scope

- Check that every dependency that touches React (Radix, shadcn
  components, Lucide, Testing Library, `@types/react`) supports React 19,
  before changing any version.
- Bump `react`, `react-dom`, `@types/react` and `@types/react-dom`, and
  update any library that does not support 19.
- Fix what the upgrade breaks, in the code and in the tests.
- Replace the `document.getElementById('quick-add-name')?.focus()`
  workaround in the People overview with a real ref.

**Explicitly excluded:** Adopting new React 19 features (Actions,
`use`, the React Compiler) and refactoring for them. New features come
with the slices that need them.

## Execution path

1. Developer triggers: checks library support, then bumps the React
   packages.
2. Build: `npm run test:quiet`, `npm run typecheck` and `npm run lint`
   show what broke; each break is fixed.
3. Developer triggers: builds the production bundle and previews it.
4. User receives: the app looks and behaves as before, and the inputs
   that should take focus now do.

## Value

- **Desirable:** The team wants to stay on the current React rather than
  carry a major-version migration into a larger codebase later.
- **Usable:** No user-visible change except that focus lands where it
  should.
- **Valuable:** Fixes a real, silent bug and keeps the foundation current
  at the cheapest moment, while the app is still small.

## Acceptance criteria

- [x] Given the upgrade, when `npm ls react react-dom` runs, then both
      report a single React 19 version and no dependency reports an
      unmet peer requirement.
- [x] Given the upgrade, when `npm run test:quiet`, `npm run typecheck`
      and `npm run lint` run, then all pass with no new warnings.
- [x] Given the Teams overview and the new-initiative control, when they
      open, then their name input has keyboard focus (verified in a
      component test).
- [x] Given the People overview, when the quick-add row needs focus, then
      it uses a ref, not `document.getElementById`.
- [x] Given `npm run build:quiet && npm run preview`, when the app loads,
      then there are no console errors and the CSP (§10.1) is unchanged.

## Delivery gate

- [ ] Deployed to production-equivalent environment

## Flags and compromises

None.
