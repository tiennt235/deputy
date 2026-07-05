# Deputy — working notes

Orchestrates Claude Code (via the **Agent SDK**, in-process) as a managed dev loop.
Single-user local. TypeScript monorepo (pnpm). See `README.md` for the full picture.

## Run
- `pnpm install`, `pnpm db:push`, `pnpm dev` (API :4000, web :5173). Postgres via Docker on :5433.
- Env is loaded with Node `--env-file=../../.env` (see `apps/api` scripts); `packages/db/.env` is a symlink to the root `.env` so the Prisma CLI sees `DATABASE_URL`.
- Agent auth is inherited from the logged-in `claude` CLI — no `ANTHROPIC_API_KEY` required.

## Layout
`packages/{core,db,git,runtime}` + `apps/{api,web}`. The loop engine is `apps/api/src/orchestrator.ts`; the SDK wrapper is `packages/runtime/src/sessionRunner.ts`.

## Non-obvious runtime gotchas (learned the hard way — don't regress)
1. **Streaming-input mode never ends on its own.** When `query({ prompt })` gets an
   `AsyncIterable`, the SDK blocks awaiting more input after the `result` message, so the
   run hangs. `SessionRunner` closes the input queue on `result` (unless guidance is
   pending) to terminate the run. See `sessionRunner.ts` result case + `InputQueue.hasPending()`.
2. **Permission-callback race.** In `runAgent.onPermission`, register the awaiter
   (`runManager.awaitPermission`) **before** emitting the `permission_request` event —
   otherwise a fast responder resolves before the resolver exists and the run hangs.
3. **`allowedTools` shadows `canUseTool`.** Bare tool names in `allowedTools` auto-approve
   before the callback runs. That's intentional (the harness auto-approve list); everything
   else falls through to `canUseTool` → human/permission inbox.
4. **Planner must be read-only via `disallowedTools`,** not plan mode. With `autoApprove`,
   the model will call `ExitPlanMode` and start editing. We strip `Edit/Write/MultiEdit/NotebookEdit/ExitPlanMode`.
5. **Worktree base ref + excludes.** Repos may default to `master` or `main`; `createWorktree`
   verifies the base ref and falls back to `HEAD`. Build artifacts are kept out of diffs via
   the worktree's real `info/exclude` (resolved with `git rev-parse --git-path`).

## Pipeline extras (Chen-inspired)
- **Auto-rollback:** maker runs are wrapped with `snapshotWorktrees` / `rollbackWorktrees`
  (git `write-tree` → `read-tree`+`checkout-index`+`clean`). A failed or errored maker run
  restores the worktree to its pre-run state instead of leaving half-baked changes.
- **Enforced end-to-end evidence:** after the maker, `runEvidence` runs a distinct
  `evidence` agent that must actually RUN the change (Bash allowed, source edits disallowed)
  and end with `EVIDENCE: pass|fail`. Fail → `changes_requested` (loops back to the maker);
  pass → `runChecker`. Both the evidence report and checker verdict show at the human gate.
  Lives inside the `checking` phase (no new lifecycle state).

## Verify changes
`cd apps/api && pnpm exec tsx --env-file=../../.env src/e2e.ts <a-git-repo>` runs the whole
lifecycle headless. `pnpm -r typecheck` (or per-package) must stay green.
