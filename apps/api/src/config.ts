import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

// All persistent state lives under DEPUTY_HOME (default ~/.deputy) so the app can
// be installed and run from anywhere while keeping its data in the user's home dir.
const deputyHome =
  process.env.DEPUTY_HOME || process.env.LOOP_HOME || path.join(os.homedir(), ".deputy");

export const config = {
  apiPort: Number(process.env.DEPUTY_PORT ?? process.env.LOOP_PORT ?? process.env.API_PORT ?? 4000),
  webOrigin: `http://localhost:${process.env.WEB_PORT ?? 5173}`,
  deputyHome,
  reposRoot: process.env.LOOP_WORKSPACE_ROOT ?? path.join(deputyHome, "repos"),
  worktreeRoot: process.env.LOOP_WORKTREE_ROOT ?? path.join(deputyHome, "worktrees"),
  // Built SPA (produced by `pnpm --filter @loop/web build`); served in app mode.
  webDist: path.resolve(repoRoot, "apps/web/dist"),
  repoRoot,
};
