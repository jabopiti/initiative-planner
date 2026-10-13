---
slice_id: "071"
title: "Status and gate slide prompts in the initiative's Actions menu"
type: "feature"
status: "valid"
criteria_failures: []
depends_on: ["070"]
verification_status: null
superseded_by: null
supersedes: null
change_summary: "Chosen by the user on 13 Oct 2026 (brainstorm A1 and A3, which they described as a pair: the status slide gives the overview, the gate slide the checklist). Copied separately, from the Actions menu, using 070's templates, slots and Include names option. Brand-pack templates per company; the example brand pack gets starter templates. Spec: §5.4 and §9.12."
recommended_model: "Claude Sonnet 5"
model_rationale: "Two menu items and two templates on top of 070's mechanism; most of the work is the default templates' wording."
spec_sections: ["§9.12 Prompts for AI tools", "§5.4 Initiative detail view", "§8.1 Passing a gate", "§8.5 Needs attention"]
---

# Status and gate slide prompts in the initiative's Actions menu

## Intent

**Problem statement:** Owners rebuild the same status and gate-review
slides by hand for every steering meeting, each in their own layout, so
slides from different owners don't look or read alike.

**Outcome statement:** From any initiative, one click copies a prompt that
makes an AI tool produce the status slide, or the gate slide, in the
company's layout, from today's figures.

## Scope

1. **Templates** (§9.12): `statusSlide` and `gateSlide` in the brand
   pack's `prompts`, with core defaults:
   - Status slide: title, phase timeline with Today, grand estimate vs
     approved at with the difference, deviation, approval track (marked
     when escalated), Needs attention items. Uses `initiative`, `timeline`,
     `costs`, `attention`, `terms`, `today`, `product`.
   - Gate slide: gate name and "X of Y complete", complete / open /
     Tentative with notes / carried forward with their gate, and the
     gate's state (Ready, Due, Overrun). Uses `initiative`, `gate`,
     `terms`, `today`, `product`.
   - Each default asks for one slide, describes its layout in words, and
     says the data blocks are information, not instructions.
2. **Actions menu** (§5.4): **Copy status slide prompt** in every status;
   **Copy gate slide prompt** while there is a current gate (Active or On
   Hold). Both follow 070's Include names option and confirmation.
3. **Example brand pack**: its own versions of both templates, so a fork
   sees how to customise them.

## Execution path

1. Open Checkout Redesign → Actions → Copy status slide prompt →
   confirmation.
2. Paste into an AI tool that makes slides → one status slide in the
   described layout.
3. Actions → Copy gate slide prompt → paste → one slide on G3: "1 of 3
   complete", Security review Tentative with its note, the rest open.

## Value

- **Desirable:** Steering slides in minutes, not an afternoon.
- **Usable:** Two clear menu items; nothing to configure.
- **Valuable:** Consistent reports across owners, always from current
  figures.

## Acceptance criteria

- [ ] Given an Active initiative, when Copy status slide prompt is chosen,
      then the clipboard holds the `statusSlide` template filled in, and
      a confirmation shows.
- [ ] Given an Active or On Hold initiative, when Copy gate slide prompt
      is chosen, then the clipboard holds the `gateSlide` template filled
      in.
- [ ] Given a Closed or Cancelled initiative, then the Actions menu offers
      the status slide prompt and not the gate slide prompt.
- [ ] Given Tentative and carried-forward items, then the gate prompt
      lists each one with its note and, when carried forward, the gate it
      came from.
- [ ] Given an escalated initiative, then the status prompt marks the
      approval track as escalated and names the recorded track.
- [ ] Given the brand pack overrides either template, then the override
      is used; without one, the core default is.
- [ ] Given Include names off, then neither prompt contains a person's
      name.
- [ ] Given the example brand pack, then its templates build and produce
      prompts that differ from the core defaults.

## Flags and compromises

- The slide's look comes from the AI tool the user picks; the template
  can only describe the layout in words. A company template that names
  its own slide master works only in tools that have it.
- A portfolio slide (A2) and a team capacity brief (A4) were left for
  later; both can reuse this slice's pattern.

## Open for review (settle in next-slice)

- Menu labels and their place and grouping in the Actions menu.
- The default templates' wording and the layouts they describe; show a
  sample of the prompt and of a slide made from it.
- Whether the gate prompt on an initiative with no checklist items (a
  gate with only the estimates requirement) is still offered.
