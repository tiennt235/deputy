# Product

## Register

product

## Users

A single technical operator — the developer who owns the machine Deputy runs on — using it
locally to delegate real development work to a crew of Claude Code agents. They are fluent in
git, diffs, and the shape of a build; they think in outcomes ("ship X, because Y"), not
step-by-step instructions. Their context while using Deputy is supervisory: they kick off a
task, let the loop run, and return to the dashboard to read state and make the two decisions
that are genuinely theirs — **approve the plan** and **approve the diff**. Often several tasks
are in flight at once, so the primary job on any screen is *read the state of the loop fast,
then act at a gate*.

## Product Purpose

Deputy turns Claude Code into a managed, self-running development loop: the operator describes
what they want and why, and a crew of agents plans, builds, verifies, and ships it in an
isolated git worktree — pausing only at the plan and diff gates. It exists to make delegation
to agents *trustworthy* — every run is grounded in visible evidence (a read-only planner, a
maker with auto-rollback, an evidence agent that actually runs the change, a fresh-context
checker) so the operator can approve with confidence instead of hope. Success is the operator
approving a diff in seconds because the dashboard already showed them everything they needed:
what changed, that it runs, and that a second agent agreed it's sound.

## Brand Personality

**Calm, precise, trustworthy.** A command center, not a showpiece. The interface should feel
like a well-run operations console: quiet by default, dense with real state, and instantly
legible under load. It foregrounds the machinery — diffs, live agent streams, evidence runs,
checker verdicts — with the crispness of an expert tool, and it stays composed even when a
whole crew is working in parallel. It respects the operator's time and expertise: no
hand-holding, no cheerful abstraction over what's actually happening, no theatrics. Confidence
comes from clarity and honesty about the work, never from decoration.

## Anti-references

- **Generic AI-SaaS.** No cream/warm-neutral hero, no purple-gradient-everything, no
  hero-metric template (big number + label + gradient accent), no endless identical
  icon+heading+text card grids, no tiny tracked uppercase eyebrow above every section.
- **Consumer chatbot.** This is an operator's control surface, not a chat toy — no oversized
  chat bubbles, playful mascots, rounded-everything, or emoji-forward tone. The live agent
  stream is telemetry, not a conversation to coo over.
- **Enterprise Jira-heavy.** Reject cluttered, gray-on-gray, deeply nested panels and menus.
  Density is fine; *undifferentiated* density is not. Complex must never mean unclear.
- **Neon cyberpunk terminal.** No matrix-green glow, scanlines, or hacker-costume aesthetic.
  Deputy is technical without cosplaying as technical.

## Design Principles

1. **The gates are sacred.** Everything funnels attention to the two decisions that are the
   operator's — approve the plan, approve the diff. What needs a human is unmistakable; what
   doesn't stays quiet. Attention is the scarcest resource; spend it at the gates.
2. **State at a glance.** This is a control surface. The operator should read the whole loop's
   status — which tasks are where in `backlog → planning → … → done`, what's waiting on them —
   without clicking. Legibility of state beats decoration every time.
3. **Show the machinery, honestly.** Diffs, evidence-run output, checker verdicts, and the live
   agent stream are the product's credibility. Surface the real work; never abstract it into a
   cheerful summary that hides what actually happened. Trust is earned by transparency.
4. **Calm under motion.** Many agents work in parallel; the UI stays composed, never frantic.
   Feedback is informative, not attention-grabbing. Motion clarifies change (a task moved, a
   gate opened) — it never performs busyness.
5. **An expert's tool.** Dense, keyboard-friendly, fast. Respect that the user is a developer
   who wants to get in, read state, decide, and get out. No onboarding wizards where a good
   default would do; no friction between the operator and the decision.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1 against its background, large/bold text ≥ 3:1 —
audit the dark palette's muted and faint text roles specifically, since low-contrast gray-on-
near-black is the most likely failure. Full keyboard operability for every action, especially
the gate approvals; visible focus states throughout. Never encode task state (planning,
review, failed) by color alone — pair it with a label, icon, or text so it survives color
blindness and grayscale. Honor `prefers-reduced-motion`: the live agent stream and any
transitions must have a calm, non-animated fallback.
