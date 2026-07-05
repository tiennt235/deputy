import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const execAsync = promisify(exec);

export interface GitResult {
  stdout: string;
  stderr: string;
}

async function git(cwd: string, args: string, opts: { allowFail?: boolean } = {}): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execAsync(`git ${args}`, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (err: any) {
    if (opts.allowFail) return { stdout: err.stdout ?? "", stderr: err.stderr ?? String(err) };
    throw new Error(`git ${args} failed in ${cwd}: ${err.stderr ?? err.message}`);
  }
}

export interface DiffFile {
  path: string;
  status: string; // A | M | D | R | ...
  additions: number;
  deletions: number;
}

export interface RepoDiff {
  files: DiffFile[];
  patch: string;
  totalAdditions: number;
  totalDeletions: number;
}

export interface CreateWorktreeInput {
  repoLocalPath: string;
  branch: string;
  worktreePath: string;
  baseBranch: string;
}

/**
 * Repo-agnostic worktree manager. Handles both mono-repo (single repo) and
 * multi-repo (one worktree per repo per task) uniformly — the caller just
 * decides how many repos a task is scoped to.
 */
export class WorktreeManager {
  constructor(private worktreeRoot: string, private reposRoot: string) {}

  /** Clone a remote repo to a local path, or verify an existing local repo. */
  async ensureRepo(input: { name: string; gitUrl?: string | null; localPath?: string | null }): Promise<string> {
    if (input.localPath && existsSync(path.join(input.localPath, ".git"))) {
      return input.localPath;
    }
    const dest = input.localPath ?? path.join(this.reposRoot, input.name);
    if (existsSync(path.join(dest, ".git"))) return dest;
    if (!input.gitUrl) {
      // Local-only repo that isn't initialised yet: init it.
      await mkdir(dest, { recursive: true });
      await git(dest, "init");
      return dest;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await git(this.reposRoot, `clone ${input.gitUrl} ${dest}`);
    return dest;
  }

  async detectDefaultBranch(repoLocalPath: string): Promise<string> {
    const r = await git(repoLocalPath, "symbolic-ref --short HEAD", { allowFail: true });
    const branch = r.stdout.trim();
    return branch || "main";
  }

  /** Create an isolated worktree on a fresh branch off baseBranch. */
  async createWorktree(input: CreateWorktreeInput): Promise<{ path: string; branch: string }> {
    const { repoLocalPath, branch, worktreePath, baseBranch } = input;
    await mkdir(path.dirname(worktreePath), { recursive: true });
    // Remove a stale worktree at the same path if present.
    if (existsSync(worktreePath)) {
      await git(repoLocalPath, `worktree remove --force ${worktreePath}`, { allowFail: true });
      await rm(worktreePath, { recursive: true, force: true });
    }
    // Prune bookkeeping and delete an existing branch of the same name.
    await git(repoLocalPath, "worktree prune", { allowFail: true });
    await git(repoLocalPath, `branch -D ${branch}`, { allowFail: true });
    // Resolve a base ref that actually exists (repo may use master/main/etc.); fall back to HEAD.
    const verify = await git(repoLocalPath, `rev-parse --verify --quiet ${baseBranch}`, { allowFail: true });
    const base = verify.stdout.trim() ? baseBranch : "HEAD";
    await git(repoLocalPath, `worktree add -b ${branch} ${worktreePath} ${base}`);
    // Keep common build artifacts out of diffs/commits without touching the
    // repo's tracked .gitignore (worktree-local exclude at the real git dir).
    try {
      const r = await git(worktreePath, "rev-parse --git-path info/exclude", { allowFail: true });
      const rel = r.stdout.trim();
      if (rel) {
        const excludePath = path.isAbsolute(rel) ? rel : path.join(worktreePath, rel);
        await mkdir(path.dirname(excludePath), { recursive: true });
        const artifacts = ["__pycache__/", "*.pyc", "node_modules/", ".pytest_cache/", ".DS_Store", "*.log"];
        await writeFile(excludePath, artifacts.join("\n") + "\n", "utf8");
      }
    } catch {
      /* best-effort */
    }
    return { path: worktreePath, branch };
  }

  /** Diff of uncommitted work in a worktree (staged + unstaged + untracked). */
  async getDiff(worktreePath: string): Promise<RepoDiff> {
    await git(worktreePath, "add -A -N", { allowFail: true }); // intent-to-add so new files show in diff
    const numstat = await git(worktreePath, "diff --numstat HEAD", { allowFail: true });
    const nameStatus = await git(worktreePath, "diff --name-status HEAD", { allowFail: true });
    const patch = await git(worktreePath, "diff HEAD", { allowFail: true });

    const statusMap = new Map<string, string>();
    for (const line of nameStatus.stdout.split("\n").filter(Boolean)) {
      const [status, ...rest] = line.split("\t");
      statusMap.set(rest.join("\t"), status);
    }

    const files: DiffFile[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const line of numstat.stdout.split("\n").filter(Boolean)) {
      const [add, del, filePath] = line.split("\t");
      const additions = add === "-" ? 0 : parseInt(add, 10) || 0;
      const deletions = del === "-" ? 0 : parseInt(del, 10) || 0;
      totalAdditions += additions;
      totalDeletions += deletions;
      files.push({ path: filePath, status: statusMap.get(filePath) ?? "M", additions, deletions });
    }
    return { files, patch: patch.stdout, totalAdditions, totalDeletions };
  }

  async hasChanges(worktreePath: string): Promise<boolean> {
    const r = await git(worktreePath, "status --porcelain", { allowFail: true });
    return r.stdout.trim().length > 0;
  }

  async commitAll(worktreePath: string, message: string): Promise<void> {
    await git(worktreePath, "add -A");
    // Use -c to avoid depending on global git identity in a fresh environment.
    const safeMsg = message.replace(/"/g, '\\"');
    await git(
      worktreePath,
      `-c user.name="Loop Engineering" -c user.email="loop@localhost" commit -m "${safeMsg}"`,
    );
  }

  async push(worktreePath: string, branch: string): Promise<void> {
    await git(worktreePath, `push -u origin ${branch}`);
  }

  async removeWorktree(repoLocalPath: string, worktreePath: string): Promise<void> {
    await git(repoLocalPath, `worktree remove --force ${worktreePath}`, { allowFail: true });
    await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
  }

  async readFile(worktreePath: string, relPath: string): Promise<string> {
    const r = await git(worktreePath, `show :${relPath}`, { allowFail: true });
    return r.stdout;
  }

  /**
   * Capture the full working-tree state (tracked + untracked) as a git tree
   * object, without moving the branch. Returned sha can be passed to restore().
   */
  async snapshot(worktreePath: string): Promise<string> {
    await git(worktreePath, "add -A", { allowFail: true });
    const r = await git(worktreePath, "write-tree", { allowFail: true });
    return r.stdout.trim();
  }

  /** Restore the working tree to a previous snapshot() tree, discarding newer changes. */
  async restore(worktreePath: string, tree: string): Promise<void> {
    if (!tree) return;
    await git(worktreePath, `read-tree ${tree}`);
    await git(worktreePath, "checkout-index -a -f");
    await git(worktreePath, "clean -fd"); // honours .git/info/exclude, so build artifacts stay
  }
}
