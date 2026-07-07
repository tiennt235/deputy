import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execAsync = promisify(exec);

export type DetectMode =
  | "missing" // path does not exist → create dir + git init
  | "existing-plain" // dir exists, no git, no sub-repos → git init here
  | "existing-single" // a single git repo
  | "existing-multi" // a dir containing several git repos
  | "invalid"; // path is a file, or unreadable

export interface DetectedRepo {
  name: string;
  localPath: string;
  kind: "mono" | "poly_member";
  defaultBranch: string;
  hasClaude: boolean;
}

export interface Detection {
  input: string;
  path: string; // resolved absolute
  exists: boolean;
  mode: DetectMode;
  suggestedName: string;
  hasClaudeAtRoot: boolean;
  repos: DetectedRepo[];
  needsScaffold: boolean; // true for missing / existing-plain
  plan: string[]; // human-readable steps the wizard will perform
}

function expand(p: string): string {
  let out = p.trim();
  if (out === "~" || out.startsWith("~/")) out = path.join(os.homedir(), out.slice(1));
  return path.resolve(out);
}

const isGit = (dir: string) => existsSync(path.join(dir, ".git"));
const hasClaude = (dir: string) => existsSync(path.join(dir, ".claude")) || existsSync(path.join(dir, ".mcp.json"));

async function detectBranch(dir: string): Promise<string> {
  for (const cmd of ["git symbolic-ref --short HEAD", "git rev-parse --abbrev-ref HEAD"]) {
    try {
      const { stdout } = await execAsync(cmd, { cwd: dir });
      const b = stdout.trim();
      if (b && b !== "HEAD") return b;
    } catch {
      /* not a repo yet, or no commits */
    }
  }
  return "main";
}

/** Read-only inspection of a local path → what the wizard would do. */
export async function detectProject(input: string): Promise<Detection> {
  const abs = expand(input);
  const suggestedName = path.basename(abs);
  const base: Detection = {
    input,
    path: abs,
    exists: existsSync(abs),
    mode: "missing",
    suggestedName,
    hasClaudeAtRoot: false,
    repos: [],
    needsScaffold: true,
    plan: [],
  };

  if (!base.exists) {
    return {
      ...base,
      mode: "missing",
      needsScaffold: true,
      repos: [{ name: suggestedName, localPath: abs, kind: "mono", defaultBranch: "main", hasClaude: false }],
      plan: [`Create directory ${abs}`, "Initialize git (git init + empty commit)", `Create project "${suggestedName}" with this repo`],
    };
  }

  const st = await stat(abs).catch(() => null);
  if (!st?.isDirectory()) {
    return { ...base, exists: true, mode: "invalid", needsScaffold: false, plan: [`${abs} is not a directory`] };
  }

  base.hasClaudeAtRoot = hasClaude(abs);

  // Single git repo?
  if (isGit(abs)) {
    return {
      ...base,
      exists: true,
      mode: "existing-single",
      needsScaffold: false,
      repos: [{ name: suggestedName, localPath: abs, kind: "mono", defaultBranch: await detectBranch(abs), hasClaude: base.hasClaudeAtRoot }],
      plan: [
        `Register existing repo ${abs}`,
        `Create project "${suggestedName}"`,
        ...(base.hasClaudeAtRoot ? ["Import .claude settings into the harness"] : []),
      ],
    };
  }

  // Container dir: scan immediate subdirs for git repos
  const entries = await readdir(abs, { withFileTypes: true }).catch(() => []);
  const subRepos: DetectedRepo[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const dir = path.join(abs, e.name);
    if (isGit(dir)) {
      subRepos.push({ name: e.name, localPath: dir, kind: "poly_member", defaultBranch: await detectBranch(dir), hasClaude: hasClaude(dir) });
    }
  }

  if (subRepos.length > 0) {
    const anyClaude = base.hasClaudeAtRoot || subRepos.some((r) => r.hasClaude);
    return {
      ...base,
      exists: true,
      mode: "existing-multi",
      needsScaffold: false,
      repos: subRepos,
      plan: [
        `Register ${subRepos.length} repos found under ${abs}`,
        `Create multi-repo project "${suggestedName}" (root = ${abs})`,
        ...(anyClaude ? ["Import .claude settings (root + each repo) into the harness"] : []),
      ],
    };
  }

  // Plain dir, no git, no sub-repos → offer to init it as a single repo.
  return {
    ...base,
    exists: true,
    mode: "existing-plain",
    needsScaffold: true,
    repos: [{ name: suggestedName, localPath: abs, kind: "mono", defaultBranch: "main", hasClaude: base.hasClaudeAtRoot }],
    plan: [
      `No git repo found in ${abs}`,
      "Initialize git here (git init + empty commit)",
      `Create project "${suggestedName}" with this repo`,
    ],
  };
}

export interface PathSuggestion {
  path: string;
  isRepo: boolean;
  hasClaude: boolean;
}

/**
 * Autocomplete real local directories for a partial path (projects are always
 * dirs). `~` expands to home; a trailing separator lists that dir's children,
 * otherwise the basename is treated as a prefix filter on its parent.
 */
export async function suggestPaths(partial: string): Promise<PathSuggestion[]> {
  let raw = (partial ?? "").trim();
  if (raw === "" || raw === "~") raw = os.homedir() + path.sep;
  else if (raw.startsWith("~/")) raw = path.join(os.homedir(), raw.slice(2));

  const endsSep = raw.endsWith("/") || raw.endsWith(path.sep);
  let baseDir = endsSep ? raw : path.dirname(raw);
  const prefix = (endsSep ? "" : path.basename(raw)).toLowerCase();
  if (!path.isAbsolute(baseDir)) baseDir = path.join(os.homedir(), baseDir);

  const entries = await readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const matches: PathSuggestion[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") && !prefix.startsWith(".")) continue; // skip dotdirs unless asked
    if (!e.name.toLowerCase().startsWith(prefix)) continue;
    const full = path.join(baseDir, e.name);
    matches.push({ path: full, isRepo: isGit(full), hasClaude: hasClaude(full) });
  }
  matches.sort((a, b) => a.path.localeCompare(b.path));
  return matches.slice(0, 20);
}

/** Create the dir (if missing) and initialize git with an empty base commit. Idempotent-ish. */
export async function scaffoldProject(input: string): Promise<Detection> {
  const abs = expand(input);
  await mkdir(abs, { recursive: true });
  if (!isGit(abs)) {
    await execAsync("git -c init.defaultBranch=main init", { cwd: abs });
  }
  // Ensure at least one commit exists so worktrees have a base ref.
  const hasCommit = await execAsync("git rev-parse HEAD", { cwd: abs })
    .then(() => true)
    .catch(() => false);
  if (!hasCommit) {
    await execAsync(
      'git -c user.name="Deputy" -c user.email="deputy@localhost" commit --allow-empty -m "init"',
      { cwd: abs },
    );
  }
  return detectProject(input);
}
