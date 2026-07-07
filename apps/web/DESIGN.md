---
name: Deputy
description: The control room for a crew of Claude Code agents — dark, dense, state-legible.
colors:
  bg: "#0d1017"
  bg-1: "#141922"
  bg-2: "#1b2230"
  bg-3: "#232c3d"
  border: "#2a3344"
  border-soft: "#212938"
  text: "#e6ebf2"
  text-dim: "#9aa7bd"
  text-faint: "#808ca4"
  accent: "#6ea8fe"
  accent-2: "#8b7bff"
  good: "#4ec9a3"
  warn: "#e0b657"
  bad: "#e0685f"
  accent-hover: "#85b6ff"
  surface-hover: "#2b3548"
  on-accent: "#0b0f17"
  on-good: "#06231a"
  edge-bad: "#4a2a2a"
  edge-tool: "#2b3a52"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.06em"
  mono:
    fontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  xs: "5px"
  sm: "7px"
  md: "10px"
  pill: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "24px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#0b0f17"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "#85b6ff"
    textColor: "#0b0f17"
  button-default:
    backgroundColor: "{colors.bg-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-good:
    backgroundColor: "{colors.good}"
    textColor: "#06231a"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-bad:
    backgroundColor: "transparent"
    textColor: "{colors.bad}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  card:
    backgroundColor: "{colors.bg-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "18px"
  task-card:
    backgroundColor: "{colors.bg-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "12px 13px"
  status-pill:
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  nav-item:
    textColor: "{colors.text-dim}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
---

# Design System: Deputy

## 1. Overview

**Creative North Star: "The Control Room"**

Deputy is the console a single operator sits at while a crew of agents does the building.
It should feel like a well-run, dimly-lit control room: quiet at rest, dense with live state,
and instantly legible under load. Nothing shouts until it needs you. The surface is a deep,
near-black navy — not for "hacker cool," but because a dark, low-glare field lets the few
meaningful colors (a task waiting on you, a verdict, a failure) carry real signal instead of
competing with decoration. Depth comes from stacking four tonal shades of that navy, not from
drop shadows. The operator reads the whole loop — which tasks sit where in `backlog → planning
→ … → done`, what's waiting on a gate — without clicking.

This system foregrounds the machinery honestly: diffs render as real colored patches, the
agent stream shows tool calls and thinking as they happen, evidence and checker verdicts sit
in plain view. It never abstracts the work into a cheerful summary. The voice is technical and
composed — the crispness of an expert tool, not the friendliness of a consumer app.

It explicitly rejects four things. It is **not generic AI-SaaS**: no cream hero, no
purple-gradient-everything, no hero-metric template, no tracked uppercase eyebrows. It is
**not a consumer chatbot**: the stream is telemetry, not a conversation with bubbles and
mascots. It is **not enterprise-Jira clutter**: dense, yes; undifferentiated gray-on-gray,
never. And it is **not a neon cyberpunk terminal**: technical without cosplaying as technical,
no matrix-green glow or scanlines.

**Key Characteristics:**
- Deep navy tonal field (`#0d1017` → `#232c3d`), depth by layering not shadow
- Color is semantic and rationed — amber = your turn, blue = the machine working
- Dense, keyboard-first, glanceable; no onboarding scaffolding
- Inter for UI, a monospace stack for anything machine-truthful (diffs, IDs, logs, configs)
- Composed under motion: feedback informs, it never performs busyness

## 2. Colors

A deep navy field carrying a small, disciplined vocabulary of signal colors; every hue that
isn't navy or ink means something specific.

### Primary
- **Signal Blue** (`#6ea8fe`): The one accent. Marks the active/primary path — the primary
  button, focused input borders, active nav and tab, and every "the machine is working" state
  (planning, executing, checking). Hover lifts to `#85b6ff`. Used sparingly; its restraint is
  what makes it read as signal.

### Secondary
- **Iris** (`#8b7bff`): A cooler violet companion to Signal Blue. Anchors the brand logo
  gradient and, semantically, the single `changes_requested` state and diff hunk headers.
  Never used as a general-purpose second accent — it has jobs.

### Tertiary — the verdict set
- **Verdict Green** (`#4ec9a3`): Success and completion — `pr_open`, `done`, approve actions,
  the `result` event, added diff lines.
- **Gate Amber** (`#e0b657`): **Reserved for states that need the operator** — `plan_review`,
  `human_review`, the gate panel, attention markers. Amber is never decorative.
- **Alert Coral** (`#e0685f`): Failure and destructive intent — `failed`, `cancelled`, errors,
  removed diff lines, the destructive (bad) button.

### Neutral
- **Ink** (`#0d1017`): The base canvas and the deepest input wells.
- **Surface / Surface-2 / Surface-3** (`#141922` / `#1b2230` / `#232c3d`): The three tonal
  lifts above Ink. Cards sit on Surface; hovered/raised chrome climbs to Surface-2 and -3.
  This ramp *is* the elevation system.
- **Border** (`#2a3344`) / **Border-soft** (`#212938`): Hairline dividers. Soft is the default
  quiet separator; the harder Border appears on hover and around active overlays.
- **Signal White** (`#e6ebf2`): Primary text.
- **Muted Steel** (`#9aa7bd`): Secondary text, dimmed labels — passes AA on all surfaces.
- **Faint Slate** (`#808ca4`): The quietest text tier — timestamps and meta. See the rule below.

### Named Rules
**The Amber-Is-Yours Rule.** Gate Amber (`#e0b657`) is reserved exclusively for states that
await the operator — plan review, human review, the gate panel, attention strips. The machine's
own working states are always blue. The operator learns to scan the board for amber and know it
means *your turn*. Never spend amber on decoration; it dilutes the one color that means "act."

**The Rationed-Accent Rule.** Signal Blue marks the primary path and machine activity, nothing
else. If a screen has more than a few blue elements, something non-primary has been miscolored.

**The Faint-Text Floor.** Faint Slate (`#808ca4`) is the quietest text tier, tuned to just
clear AA (~4.7:1 on card surfaces) — its predecessor `#67748c` sat at ~3.6:1 and failed. It is
reserved for genuinely secondary meta (timestamps, "3 repos") *by hierarchy*, not because it is
hard to read. Anything below this lightness is prohibited for text; when a role needs more
presence than meta, step up to Muted Steel.

## 3. Typography

**Display / UI Font:** Inter (falls back to the system sans stack: `-apple-system`,
`BlinkMacSystemFont`, `Segoe UI`, `Roboto`).
**Mono Font:** `SF Mono` / `JetBrains Mono` / `Fira Code` (falls back to `ui-monospace`).

> Note: neither family is bundled or `@font-face`-loaded today — both resolve to the OS default
> when absent. Treat the stacks above as the contract; if brand-exact rendering matters, self-host
> Inter and a mono face.

**Character:** Neutral, technical, engineered for density. One humanist sans does all the UI
work across weights (400 → 700); a monospace face carries everything machine-truthful. The
pairing contrasts on the sans/mono axis — never two similar sans families. Headings ride
slightly tight (-0.01em to -0.02em) for a composed, engineered feel.

### Hierarchy
- **Display** (700, 20px, -0.02em): The single largest element — stat/metric values only.
  There is no marketing hero here; this is as loud as the type gets.
- **Headline** (650, 17px, -0.01em): The sticky top-bar page title.
- **Title** (650, 15px, -0.01em): Section headings (`h2`), card and panel titles.
- **Body** (400, 14px, 1.5): Default reading size for all prose and controls.
- **Label** (600, 11px, 0.06em, UPPERCASE): Nav-section headers, stat keys, event-row kickers.
  The one place tracked uppercase is legitimate — as a functional micro-label, not a decorative
  section eyebrow.
- **Mono** (400, 12.5px): Diffs, task IDs, cron strings, config/memory editors, event payloads —
  anything quoted verbatim from the machine.

### Named Rules
**The Machine-Speaks-Mono Rule.** Anything reproduced literally from the system — a diff, an ID,
a file path, a config blob, an agent's raw output — is set in the mono stack. Prose *about* the
work is set in Inter. The font boundary tells the operator what is quoted versus what is narrated.

**The Micro-Label Exception.** Tracked uppercase (0.06em, 11px) is allowed *only* as a
functional label (nav sections, stat keys, event kickers). It is never the decorative
per-section eyebrow this system's anti-references forbid.

## 4. Elevation

This system is **near-flat and tonal**. Depth is conveyed almost entirely by the four-step navy
ramp (Ink → Surface → Surface-2 → Surface-3) plus hairline borders, not by shadow. A card is
"above" the canvas because it is a lighter navy with a soft border, not because it casts a
shadow. Hover states nudge a border brighter or lift a card by a single pixel — restraint over
theatrics.

### Shadow Vocabulary
- **Overlay shadow** (`box-shadow: 0 8px 30px rgba(0,0,0,0.35)`): The one shadow in the system.
  Reserved for true floating overlays — the modal dialog — to separate it from the dimmed
  backdrop. Never applied to inline cards or resting chrome.

### Named Rules
**The Tonal-Depth Rule.** Elevation is expressed by climbing the navy ramp, never by adding
shadow to inline surfaces. If a card needs to feel raised, lighten its background or brighten
its border — do not reach for a shadow. Shadow means "this floats above the page," and only the
modal earns that.

## 5. Components

### Buttons
- **Shape:** Gently rounded (7px, `{rounded.sm}`). Inline-flex, 7px gap for optional icon, weight ~550.
- **Primary:** Signal Blue fill with near-black ink text (`#0b0f17`), 8px 14px padding — the
  active path. Hover brightens to `#85b6ff`.
- **Default:** Surface-3 fill, Signal White text, Border outline — the neutral action. Hover to `#2b3548`.
- **Good / Bad:** Verdict Green fill (approve) / transparent with Coral text and a muted red
  border (destructive). These pair with the two gates.
- **Ghost & sm:** Transparent background; `sm` drops to 5px 10px / 12.5px for dense toolbars.
- **Disabled:** 45% opacity, `not-allowed` cursor.

### Status Pills
- **Style:** Fully rounded (20px), 11.5px 600-weight, tinted background at ~12–13% of the state
  color over a colored text of the same hue, plus a 6px filled dot. Distinct classes per
  lifecycle state map directly to the color semantics in §2.
- **State:** Blue = machine working; Amber = awaiting operator; Green = shipped/done;
  Coral = failed/cancelled; Iris = changes requested; neutral Surface-3 = backlog.

### Cards / Containers
- **Corner Style:** 10px (`{rounded.md}`); nested task-cards use 7px.
- **Background:** Surface (`#141922`) on the Ink canvas; a `pad-0` variant zeroes padding for
  flush content (tables, lists).
- **Elevation:** Flat — Border-soft hairline, no shadow (see §4).
- **Internal Padding:** 18px for cards; 12–13px for the denser task-card.
- **Task-card behavior:** Hover brightens the border and lifts 1px (`translateY(-1px)`). An
  attention variant (a task sitting at a gate) takes a full Amber hairline border plus a faint
  Amber tint (`--attn-edge` / `--attn-tint`) — the same amber-means-you language as the gate
  panel. It is a full border, never a side-stripe.

### Inputs / Fields
- **Style:** Ink (`#0d1017`) well, Border outline, 7px radius, 9px 12px padding. Sits *darker*
  than the Surface card it lives on — inputs recede, they don't pop.
- **Focus:** Border shifts to Signal Blue. No glow, no ring beyond the border color change.
- **Labels:** 12px Muted Steel, 550 weight, above the field.
- **Textarea:** Vertical-resize only; mono variant for configs, memory, and policy editors.

### Navigation
- **Sidebar:** Fixed 232px rail on Surface with a soft right border. Nav items are Muted Steel,
  550 weight, 7px radius; hover fills Surface-2 and brightens text; active fills Surface-3.
  Section headers use the uppercase micro-label. A right-aligned badge carries counts.
- **Top bar:** Sticky, translucent Ink at 85% with an 8px backdrop blur and a soft bottom
  border — the one sanctioned use of backdrop-filter, for the scroll-pinned header only.
- **Tabs:** Text tabs with a 2px Signal Blue underline on the active tab; Muted Steel at rest.

### Loading & Empty
- **Loading:** Content loads show skeleton bars (`.skeleton`, a slow shimmer over Surface-2/-3),
  never a centered spinner. The only spinner in the product is the small ring in the task top bar
  that means "an agent is running right now" — motion there conveys live state.
- **Empty:** Empty states teach the next action ("No tasks yet. Create a project and add a task
  to start a loop.") rather than saying "nothing here."

### Signature — The Agent Stream & Diff
- **Event row:** A bordered Surface row per event, 7px radius, with an uppercase micro-label
  kicker colored by kind — `tool_use` blue, `result` green, `error` coral, `thinking` dimmed
  and italic. Payloads render in mono. This is the honest window into the machinery.
- **Diff view:** Mono, per-line coloring on an Ink background — Verdict Green additions, Coral
  deletions, Iris hunk headers. File headers sit on Surface-2 with add/del counts. Diffs are
  shown as real patches, never summarized away.
- **Gate panel:** An Amber-bordered, faintly Amber-tinted block that hosts the plan/diff
  approval. It is the loudest calm thing on the screen — the one place the operator must act.

## 6. Do's and Don'ts

### Do:
- **Do** reserve Gate Amber (`#e0b657`) exclusively for states that need the operator; let the
  operator scan for amber and know it means *act*.
- **Do** express elevation by climbing the navy ramp (Ink → Surface → Surface-2 → Surface-3) and
  hairline borders; keep inline surfaces shadow-free.
- **Do** set anything quoted verbatim from the machine — diffs, IDs, configs, agent output — in
  the mono stack; narrate *about* the work in Inter.
- **Do** keep Signal Blue rationed to the primary path and machine-working states.
- **Do** pair every state color with its text label and dot; never rely on hue alone (color-blind
  and grayscale safety).
- **Do** step muted text up to Muted Steel (`#9aa7bd`) for anything readable; hold AA (4.5:1 body).
- **Do** use the ease-out curve (`--ease`, `cubic-bezier(0.22, 1, 0.36, 1)`) for all state
  transitions; never bounce or elastic.
- **Do** give every interactive element a visible keyboard focus ring (2px Signal White outline)
  and make clickable rows/tabs operable with Enter/Space, not just the mouse.
- **Do** honor `prefers-reduced-motion`: transitions, hover lifts, the spinner, and the skeleton
  shimmer all collapse to static so motion-sensitive operators aren't punished.
- **Do** use skeleton placeholders (`.skeleton`) for content that is still loading; reserve the
  spinner strictly for the live "agent is working" indicator in the task top bar.
- **Do** collapse the two-column form layouts (`.split` / `.split-wide`) to a single column below
  900px so the panels never crush on a narrow window.

### Don't:
- **Don't** ship generic AI-SaaS: no cream/warm-neutral hero, no purple-gradient-everything, no
  hero-metric template (big number + label + gradient accent), no identical icon+heading+text
  card grids, no tiny tracked uppercase eyebrow above every section.
- **Don't** turn the agent stream into a consumer chatbot — no oversized chat bubbles, mascots,
  rounded-everything, or emoji-forward tone. It is telemetry, not a conversation.
- **Don't** drift into enterprise-Jira clutter: gray-on-gray, deeply nested panels, density that
  isn't differentiated. Complex must never mean unclear.
- **Don't** cosplay as a terminal: no matrix-green glow, scanlines, or neon cyberpunk hacker
  aesthetic.
- **Don't** use Faint Slate (`#808ca4`) for body or any text the operator must read; it is the
  meta tier by hierarchy (timestamps, counts). Never darken a text color below it — `#67748c` and
  darker fail AA on card surfaces.
- **Don't** add drop shadows to inline cards or resting chrome; the modal overlay is the only
  element that earns a shadow.
- **Don't** use a colored `border-left`/`border-right` stripe anywhere — there are none in this
  system. Signal "needs you" with a full Amber border + tint (the attention card), never a side edge.
- **Don't** introduce a second general-purpose accent; Iris has assigned jobs (logo, hunk headers,
  `changes_requested`) and Signal Blue owns the primary path.
