# Visual direction

The design system in `src/styles.css` is built to this. It is written down
because the alternative — deciding density and type and state one rule at a
time, in the middle of a page — is how a stylesheet ends up with four spacing
steps and seven meanings for `.tag`.

This is a durable document in the [DESIGN.md](DESIGN.md) sense: it records
*why* the tokens are what they are. The tokens themselves live in the code and
the code is authoritative. When the two disagree, this file is the one to
correct.

---

## What is being designed

A single-user planner for the cost and people capacity of initiatives running
through a fixed stage-gate process. One person, offline, in a browser tab,
reading numbers for an hour at a time and comparing them against what was
approved at a gate.

That last sentence is the whole brief. It rules out most of what a general
design system optimises for. Nobody is being onboarded, nobody is being sold
to, and there is no first impression to win — there is a person who already
knows what the tool does, looking for one figure among two hundred. Every
decision below is answerable to that.

### What it is not

Not a marketing surface, not a mobile-first product, not a consumer app. It
does not need a hero, a scroll narrative, or personality in its empty states.
Density is not a compromise here; it is the feature. A screen that shows
twelve months of capacity for nine people without scrolling is doing its job
better than a roomier one that shows four.

---

## The idea: a ledger, ruled

The subject's own artifacts are a ledger and an approval stamp. Costs in
columns, one row per person per phase, a total at the foot, and a date on
which someone signed. The interface should read as that: ruled, quiet,
numeric, with the governed things marked.

Three consequences, and everything else follows from them.

**Rules carry the structure, not boxes and not shadows.** A hairline separates
rows of like things. A heavier rule separates one panel from the next. Nothing
floats except what is genuinely floating above the page and dismissible. This
is why elevation has exactly two levels (below) and why corners are square —
which `AGENTS.md` requires anyway, but for its own reasons; here it also
happens to be right.

**The left edge is the governance channel.** A 2px rule down the left of a
panel or a row means *this thing has a state the process cares about*: a gate
waiting to be passed, a phase frozen by approval, an allocation still costing
after its membership ended. Neutral things have no left edge. The device is
already half-present in the gate banner; making it systematic gives the eye one
place to check, and stops "important" from being expressed six different ways.
It encodes something true about the content rather than decorating it.

**Numerals are the display face.** There is no display typeface here — a
white-label build ships no font file, and reaching for a serif would be a
costume. The typographic contrast that carries the personality is between the
proportional UI face at small sizes with wide letter-spacing for labels, and
the monospaced numeric face at large sizes with tight letter-spacing for
figures. The biggest thing on a page in a costing tool should be a number, and
it should be set as a number: tabular, aligned, weighted.

### The signature: the process rail

The stepper at the top of an initiative is the one component that only this
kind of tool has, and it is where the boldness gets spent. Phases abut into a
continuous horizontal rail, each segment capped by a thick top rule whose
colour is that gate's outcome: passed, skipped, current, not yet reached. Read
left to right it is a single line that changes colour where a gate was crossed,
with a dashed cap where one was skipped rather than passed. A skipped gate must
never look like a passed one; that difference is the reason a skip is recorded
at all.

Everything around it stays quiet.

---

## Density

The reference points for enterprise tables put a "condensed" row at 40px and a
regular one at 48px. Those are comfortable-web numbers, and they are for rows
of text. Here a 13px cell with 8px of vertical padding lands a text row at
**36px** — below what the references call condensed, on a tool someone reads
for an hour rather than visits.

A row holding a control is **49px**, because the control is 32px and has to
stay a real target. That difference is worth stating rather than hiding: a
table you only read is denser than a table you type into, and pretending
otherwise would mean either cramped inputs or wasted rows. Measured on the
initiative detail, which has both kinds.

There is one density, not a user-switchable set. A switch is a real feature
with real state, and `SPEC.md` §1 is not a backlog.

A cell holds one line. Squeezing a nine-column table into a narrow viewport
otherwise wraps every cell and turns a 36px row into a 114px one, which costs
far more than the horizontal scroll it was avoiding. Cells that genuinely
carry sentences — a checklist item's description, an approval track's
requirement, a skip reason — opt out and take the height they need.

The spacing scale is 4px-based and runs past the four steps it had:
`0.125 · 0.25 · 0.5 · 0.75 · 1 · 1.5 · 2 · 3 · 4rem`. The half-step exists for
badges and inline marks, where 4px is already too much.

## Type scale

Base is 14px, not 16px. A dense productive interface can drop below the web's
default and should; 14px for controls and body, 13px for table cells, 11px for
the label voice. The ratio between steps is deliberately tight (about 1.125)
so that eight levels coexist without any of them shouting — a wide scale in an
interface this dense produces headings that fight the data.

| Token | Size | Role |
|---|---|---|
| `--text-2xs` | 11px | the label voice: column heads, eyebrow headings, badges |
| `--text-xs` | 12px | micro notes under a value |
| `--text-sm` | 13px | table cells, dense panels |
| `--text-md` | 14px | body, buttons, fields — the default |
| `--text-lg` | 16px | panel heading (`h2`) |
| `--text-xl` | 20px | page heading (`h1`) |
| `--text-display` | 28px | a figure that is the point of its panel |

Weights are 400 / 500 / 600 / 700, and they mean something: 500 is a value that
matters more than its neighbours, 600 is a heading or a total, 700 is reserved
for the display numeral. Two tracking tokens: wide (0.06em) for the uppercase
label voice, tight (-0.01em) for display numerals.

**The label voice** is the one piece of styling used often enough to name.
Uppercase, 11px, 600, tracked wide, muted. It marks a column head, a section
heading inside a panel, a badge. It is never used for anything a person reads
as a sentence.

## Colour roles

The palette is not the brand's to choose beyond one hue. `AGENTS.md`'s
brand-pack contract keeps `--brand*` as the only brand-specific block, and this
row does not widen it — §4.8 does, per D8. So the roles below are defined
against a neutral ramp that stays at its own fixed cool blue-grey hue (220°), rather
than adopting a warmer tone, and the accent is whatever the brand pack says it is.

- **Canvas** — the page ground. Slightly off-white in light, slightly off-black
  in dark.
- **Surface** — panels, cards, table cells, fields. One step toward the light
  in both themes, so a surface reads as raised without a shadow. This
  separation is what lets a sticky table header and a frozen first column be
  legible over the rows behind them.
- **Surface raised** — popovers, the toast and the dialog only.
- **Foreground / muted / faint** — three text weights, in that order of
  emphasis. `muted` is for supporting prose; `faint` is for a placeholder or a
  dash standing in for an absent value.
- **Line / line-soft** — a hairline between panels and between rows
  respectively.
- **Accent** — the brand hue (default 153°, Farn's forest green). It marks *selection and the current thing*, never
  severity. A primary button, the current nav item, the current phase, the
  current month.
- **Ok / warn / danger** — outcome, not decoration. Farn's moss (92°), ember (355°), and grain (41°). Each has a text colour and
  a tint for a row background. Over-allocation, a stranded allocation and a
  skipped gate are warnings that colour; they never disable anything, which is
  `SPEC.md` §5.2's stance and not a styling choice.

Chart colours stay a separate six-step cycle plus a spare tone, unchanged —
they are a data-encoding problem, not a palette problem, and `dataviz` governs
them.

### State

Interaction states are one overlay token each, mixed from the foreground colour
at a fixed opacity, so they compose over any surface and re-derive themselves
when the brand pack or the theme changes. Selection is the exception and is a
solid accent tint, because selection is a semantic state rather than a
transient one — you should be able to tell what is selected in a screenshot.

- hover: foreground at 6%
- active (pressed): foreground at 12%
- selected: accent tint, plus a 2px accent edge where the component has one
- disabled: 50% opacity and the muted foreground, never a different colour

**Focus** is not one of these. The ring is a 2px solid line in the *foreground*
colour, offset 2px from the element, so there is a band of page showing between
the two. Foreground rather than accent, deliberately: an accent ring is
invisible on an accent-filled button, and a downstream brand pack can set the
accent to any luminance it likes. Contrast against both the element and the
page has to survive that. Every interactive element gets it — buttons, links,
fields, selects, table cells that take arrow-key focus, and the scroll regions
around wide tables.

## Elevation

Two levels, and the rule for choosing is not "how important is this".

- **Flat** — everything anchored in the page: panels, cards, tiles, tables,
  fields, the header. Separated by rules and by the canvas/surface step. No
  shadow, ever.
- **Raised** — things floating above the page: popovers, the toast, and the
  one modal dialog. Shadow plus the raised surface colour, since a shadow
  alone barely reads in dark mode.

The dialog is the exception to "a click elsewhere dismisses it", and that is
the whole reason it exists as a separate thing. It is used only where a
decision cannot proceed without an answer — skipping a gate needs a reason —
and there a click elsewhere would throw away what has been typed. Everything
else that floats is a popover. A native `<dialog>` with `showModal()`, so the
focus trap, Escape, the inert page behind it and focus restored to whatever
opened it all come from the platform rather than from this codebase.

## Motion

Motion here has one job: to make a change of state legible, not to entertain.
Three durations and three curves, in the productive idiom — short, decisive,
and asymmetric so that things leave faster than they arrive.

- `fast` 90ms — hover and press tints, the focus ring
- `base` 160ms — a popover or toast arriving, a region collapsing
- `slow` 240ms — the nav panel on a narrow viewport, the only travel long
  enough to need it

Nothing animates layout, nothing animates on first paint, and nothing loops.
`prefers-reduced-motion: reduce` collapses all three durations to effectively
zero in one place, at the token, so no rule has to remember.

## Responsive

Two breakpoints, named for what changes rather than for a device:

- **48rem (768px)** — below this the nav collapses behind a menu button, the
  header stacks, toolbars wrap to full-width rows, and card and tile grids drop
  to one column.
- **64rem (1024px)** — above this, multi-column grids get their full width.

### What a wide table does when the viewport is narrow

One answer for all of them, because they are all comparison tables and the
alternative is worse. **A table stays a table.** It scrolls horizontally inside
a labelled region that is reachable by keyboard, with the first column frozen
so a row never loses its identity, and — where the table owns its own vertical
scroll — a sticky header so a column never loses its meaning.

Stacking each row into a card is the other common answer and it is rejected
here: applying `display` properties to table elements drops the native table
semantics in some browsers, which takes the header/cell relationship away from
screen-reader users. That relationship is the entire value of these tables.
Nobody opens a twelve-month capacity grid to read one cell.

Concretely: the people table, the capacity grid, the month-by-month table, the
per-phase allocation tables, the portfolio table and the gate comparison all
get the same treatment. The countries-and-rates table is the one exception in
shape — its twelve working-day inputs are a nested table, and the nesting gets
its own scroll region rather than making the outer table twelve columns wide.

Sticky headers only work where a table scrolls vertically inside its own box,
which is a fact about `position: sticky` and not a preference: a
horizontally-scrolling wrapper is only as tall as its table, so there is
nothing for a header to stick against. The frozen first column works
everywhere.

## Icons

One inline SVG sprite, `<symbol>` plus `<use>`, coloured through `currentColor`
so a theme change needs no second definition and no second file. Icons are
earned, not decorative: theme, import, export, add, remove, duplicate, search,
sort, expand/collapse, row chevron, gate outcome, warning, copy, undo, and the
menu button the narrow nav needs.

An icon-only button carries an `aria-label` and a `title`, and never stands
alone on a destructive action — Remove and Delete keep their words.

## Components

Documented in the stylesheet at the block that defines each one, and used
everywhere rather than re-invented per page: button (default, primary, danger,
ghost, small, icon-only), field, select, table, panel, card, tile, badge,
banner, popover, dialog, toast, empty state.

The panel is worth one line of its own, because it is the unit a long page is
navigated by. Every panel carries an id, a heading, and an accessible name
that matches the heading; a page that has more panels than fit on a screen
builds a list of them once and lets its navigation, its rail and its jump menu
all address that list, rather than each keeping its own idea of what the page
contains.

The badge is the one worth calling out. `.tag` previously carried at least
seven unrelated meanings — a custom rate, a stranded membership, an
out-of-period cost, the current month, a skipped gate, a costed phase, an
approval-track abbreviation. One treatment for seven semantics is a large part
of why hierarchy was hard to read. Badges now come in kinds — neutral, accent,
info, ok, warn, danger, quiet — and each use site says which it means.
