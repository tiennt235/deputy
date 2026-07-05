import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { prisma } from "@loop/db";
import { WorktreeManager } from "@loop/git";
import { SessionRunner, type StartRunInput, type RunResult } from "@loop/runtime";
import {
  assertTransition,
  DEFAULT_PERMISSION_POLICY,
  type PermissionPolicy,
  type TaskStatus,
} from "@loop/core";
import { config } from "./config.js";
import { emitEvent, emitStatus } from "./emit.js";
import { runManager } from "./runManager.js";
import { syncSkills } from "./skills.js";

const execAsync = promisify(exec);
const wt = new WorktreeManager(config.worktreeRoot, config.reposRoot);
const runner = new SessionRunner();

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "task";
}

async function setStatus(taskId: string, status: TaskStatus): Promise<void> {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  assertTransition(task.status as TaskStatus, status);
  await prisma.task.update({ where: { id: taskId }, data: { status } });
  emitStatus(taskId, status);
}

async function loadHarness(task: { harnessId: string | null; projectId: string }) {
  if (task.harnessId) {
    const h = await prisma.harness.findUnique({ where: { id: task.harnessId } });
    if (h) return h;
  }
  const def = await prisma.harness.findFirst({
    where: { projectId: task.projectId, isDefault: true },
  });
  return def;
}

function harnessPolicy(harness: any): PermissionPolicy {
  const raw = harness?.permissionPolicy;
  if (raw && typeof raw === "object" && Array.isArray(raw.allow)) return raw as PermissionPolicy;
  return DEFAULT_PERMISSION_POLICY;
}

/** Ensure a worktree exists for every repo the task is scoped to. */
async function ensureWorktrees(taskId: string): Promise<{ cwd: string; additional: string[] }> {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const repoIds = task.repoIds.length
    ? task.repoIds
    : (await prisma.repo.findMany({ where: { projectId: task.projectId } })).map((r) => r.id);

  const paths: string[] = [];
  for (const repoId of repoIds) {
    const repo = await prisma.repo.findUniqueOrThrow({ where: { id: repoId } });
    const localPath = await wt.ensureRepo({ name: repo.name, gitUrl: repo.gitUrl, localPath: repo.localPath });
    if (localPath !== repo.localPath) {
      await prisma.repo.update({ where: { id: repo.id }, data: { localPath } });
    }
    const branch = `deputy/${slug(task.title)}-${task.id.slice(-6)}`;
    const worktreePath = path.join(config.worktreeRoot, `${task.id}-${repo.name}`);
    const base = repo.defaultBranch || (await wt.detectDefaultBranch(localPath));

    const existing = await prisma.worktree.findFirst({ where: { taskId, repoId: repo.id } });
    if (!existing) {
      await wt.createWorktree({ repoLocalPath: localPath, branch, worktreePath, baseBranch: base });
      await prisma.worktree.create({
        data: { taskId, repoId: repo.id, branch, path: worktreePath, status: "active" },
      });
      // Sync project skills into this worktree's .claude/skills so the agent loads them.
      await syncSkills(task.projectId, worktreePath);
    }
    paths.push(worktreePath);
  }
  return { cwd: paths[0], additional: paths.slice(1) };
}

interface RunAgentArgs {
  taskId: string;
  role: "planner" | "maker" | "checker" | "evidence";
  prompt: string;
  cwd: string;
  additional: string[];
  harness: any;
  permissionMode: StartRunInput["permissionMode"];
  autoApprove: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
  policyOverride?: PermissionPolicy;
  resume?: string;
}

/** Start a Claude Code run, wire events + permissions, and await completion. */
async function loadConnectors(projectId: string): Promise<Record<string, unknown> | undefined> {
  const connectors = await prisma.connector.findMany({ where: { projectId, enabled: true } });
  if (connectors.length === 0) return undefined;
  const servers: Record<string, unknown> = {};
  for (const c of connectors) servers[c.name] = c.config;
  return servers;
}

async function runAgent(args: RunAgentArgs): Promise<RunResult> {
  const { taskId } = args;
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const mcpServers = await loadConnectors(task.projectId);
  const run = await prisma.run.create({
    data: { taskId, role: args.role as any, status: "running" },
  });

  const handle = runner.start({
    prompt: args.prompt,
    cwd: args.cwd,
    additionalDirectories: args.additional,
    model: args.harness?.model || undefined,
    permissionMode: args.permissionMode,
    allowedTools: args.allowedTools ?? args.harness?.allowedTools ?? [],
    disallowedTools: args.disallowedTools,
    policy: args.policyOverride ?? harnessPolicy(args.harness),
    autoApprove: args.autoApprove,
    systemPromptAppend: args.harness?.systemPromptAppend || undefined,
    settingSources: ["project"],
    mcpServers,
    resume: args.resume,
    onEvent: async (e) => {
      await emitEvent(taskId, e.type, e.payload, run.id);
    },
    onPermission: async (ask) => {
      const req = await prisma.permissionRequest.create({
        data: {
          taskId,
          runId: run.id,
          toolName: ask.toolName,
          input: ask.input as any,
          toolUseId: ask.toolUseId,
          status: "pending",
        },
      });
      // Register the awaiter BEFORE emitting, so a fast responder (auto-approve or
      // an already-open UI) can't resolve before the resolver exists.
      const decisionPromise = runManager.awaitPermission(req.id);
      await emitEvent(taskId, "permission_request", {
        id: req.id,
        toolName: ask.toolName,
        input: ask.input,
      }, run.id);
      const decision = await decisionPromise;
      await prisma.permissionRequest.update({
        where: { id: req.id },
        data: {
          status: decision.allow ? "allowed" : "denied",
          decidedBy: "human",
          reason: decision.reason,
          decidedAt: new Date(),
        },
      });
      await emitEvent(taskId, "permission_resolved", { id: req.id, allow: decision.allow }, run.id);
      return decision;
    },
  });

  runManager.setRun(taskId, handle);
  const result = await handle.done;
  runManager.clearRun(taskId);

  await prisma.run.update({
    where: { id: run.id },
    data: {
      status: result.status,
      sdkSessionId: result.sessionId,
      costUsd: result.costUsd,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      endedAt: new Date(),
    },
  });
  // Roll cost up onto the task.
  await prisma.task.update({
    where: { id: taskId },
    data: {
      costUsd: { increment: result.costUsd },
      inputTokens: { increment: result.inputTokens },
      outputTokens: { increment: result.outputTokens },
      sessionId: result.sessionId ?? undefined,
    },
  });
  return result;
}

/** Snapshot every worktree so a failed run can be rolled back to a clean state. */
async function snapshotWorktrees(taskId: string): Promise<Record<string, string>> {
  const wts = await prisma.worktree.findMany({ where: { taskId } });
  const snaps: Record<string, string> = {};
  for (const w of wts) snaps[w.path] = await wt.snapshot(w.path);
  return snaps;
}

async function rollbackWorktrees(taskId: string, snaps: Record<string, string>): Promise<void> {
  for (const [p, tree] of Object.entries(snaps)) {
    try {
      await wt.restore(p, tree);
    } catch {
      /* best-effort */
    }
  }
  await emitEvent(taskId, "error", {
    message: "Run failed — worktree rolled back to the last good snapshot.",
  }).catch(() => {});
}

async function taskContext(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: task.projectId } });
  const harness = await loadHarness(task);
  return { task, project, harness };
}

// ─────────────────────────── Lifecycle steps ───────────────────────────

export async function startPlanning(taskId: string): Promise<void> {
  const { task, project, harness } = await taskContext(taskId);
  await setStatus(taskId, "planning");
  const { cwd, additional } = await ensureWorktrees(taskId);

  const prompt = [
    "You are planning a software change. Do NOT edit any files — produce a concise, actionable implementation plan only.",
    "",
    `# Task\n${task.title}\n\n${task.description || "(no description)"}`,
    project.memory ? `\n# Project context\n${project.memory}` : "",
    `\n# Working directories\n- ${cwd}${additional.map((a) => `\n- ${a}`).join("")}`,
    "\nExplore the code as needed, then output the implementation plan as markdown.",
  ].join("\n");

  try {
    const result = await runAgent({
      taskId,
      role: "planner",
      prompt,
      cwd,
      additional,
      harness,
      permissionMode: "default",
      autoApprove: true, // planning is read-only; no human gate needed mid-run
      allowedTools: ["Read", "Grep", "Glob"],
      // Hard-guarantee read-only: strip all mutating tools from the planner entirely.
      disallowedTools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "ExitPlanMode"],
    });
    const planContent = result.resultText || "(the planner returned no plan)";
    await prisma.plan.create({ data: { taskId, content: planContent, status: "proposed" } });
    await emitEvent(taskId, "plan_proposed", { content: planContent });
    await setStatus(taskId, "plan_review");
  } catch (err: any) {
    await failTask(taskId, err);
  }
}

export async function approvePlan(taskId: string, editedContent?: string): Promise<void> {
  const plan = await prisma.plan.findFirst({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });
  if (plan) {
    await prisma.plan.update({
      where: { id: plan.id },
      data: { status: "approved", humanEdits: editedContent ?? null },
    });
  }
  await setStatus(taskId, "executing");
  void startExecuting(taskId).catch((e) => failTask(taskId, e));
}

export async function rejectPlan(taskId: string, feedback?: string): Promise<void> {
  const plan = await prisma.plan.findFirst({ where: { taskId }, orderBy: { createdAt: "desc" } });
  if (plan) await prisma.plan.update({ where: { id: plan.id }, data: { status: "rejected" } });
  await setStatus(taskId, "planning");
  // Re-plan with feedback appended to the task (simple approach).
  if (feedback) {
    await emitEvent(taskId, "assistant_text", { text: `Re-planning with feedback: ${feedback}` });
  }
  void startPlanning(taskId).catch((e) => failTask(taskId, e));
}

export async function startExecuting(taskId: string): Promise<void> {
  const { task, project, harness } = await taskContext(taskId);
  const { cwd, additional } = await ensureWorktrees(taskId);
  const plan = await prisma.plan.findFirst({
    where: { taskId, status: "approved" },
    orderBy: { createdAt: "desc" },
  });
  const planText = plan?.humanEdits || plan?.content || "(no plan)";

  const prompt = [
    "Implement the following approved plan. Make changes directly in the working directory.",
    "Validate your work (build/tests/typecheck) where possible. Do NOT commit — the platform commits.",
    "",
    `# Task\n${task.title}\n\n${task.description || ""}`,
    project.memory ? `\n# Project context\n${project.memory}` : "",
    `\n# Approved plan\n${planText}`,
    `\n# Working directories\n- ${cwd}${additional.map((a) => `\n- ${a}`).join("")}`,
  ].join("\n");

  const policy = harnessPolicy(harness);
  const snaps = await snapshotWorktrees(taskId);
  try {
    const result = await runAgent({
      taskId,
      role: "maker",
      prompt,
      cwd,
      additional,
      harness,
      permissionMode: (policy.defaultMode as any) ?? "default",
      autoApprove: false, // human answers fall-through permission prompts
    });
    if (result.isError) {
      await rollbackWorktrees(taskId, snaps);
      await failTask(taskId, new Error(result.resultText || "maker run errored"));
      return;
    }
    await setStatus(taskId, "checking");
    void runEvidence(taskId).catch((e) => failTask(taskId, e));
  } catch (err: any) {
    await rollbackWorktrees(taskId, snaps);
    await failTask(taskId, err);
  }
}

/**
 * Enforced end-to-end evidence step. Before a human ever sees the diff, an agent
 * must actually EXERCISE the change (run it/tests/build) and produce concrete
 * evidence. If it can't demonstrate the change works, the task loops back to the
 * maker instead of advancing — evidence is a gate, not a suggestion.
 */
export async function runEvidence(taskId: string): Promise<void> {
  const { task, project, harness } = await taskContext(taskId);
  const worktrees = await prisma.worktree.findMany({ where: { taskId } });
  const plan = await prisma.plan.findFirst({ where: { taskId, status: "approved" }, orderBy: { createdAt: "desc" } });
  const worktreePaths = worktrees.map((w) => w.path);

  const prompt = [
    "Demonstrate END-TO-END that the implemented change actually works in the working directory.",
    "Do NOT just read the code — RUN it: execute the relevant build, tests, script, or feature and observe real output.",
    "Capture the exact commands you ran and their actual output as evidence. Do not edit any source files.",
    "",
    `# Task\n${task.title}\n${task.description || ""}`,
    project.memory ? `\n# Project context\n${project.memory}` : "",
    `\n# Plan\n${plan?.humanEdits || plan?.content || "(none)"}`,
    `\n# Working directories\n- ${worktreePaths.join("\n- ")}`,
    "\nEnd your response with EXACTLY one line, either:",
    "EVIDENCE: pass",
    "or",
    "EVIDENCE: fail — <what could not be demonstrated>",
  ].join("\n");

  const result = await runAgent({
    taskId,
    role: "evidence",
    prompt,
    cwd: worktreePaths[0] ?? config.repoRoot,
    additional: worktreePaths.slice(1),
    harness,
    permissionMode: "default",
    autoApprove: true, // must run commands unattended…
    allowedTools: ["Read", "Grep", "Glob", "Bash"],
    // …but never modify source: evidence proves the maker's work, it doesn't fix it.
    disallowedTools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "ExitPlanMode"],
    policyOverride: { allow: ["Read", "Grep", "Glob", "Bash"], ask: [], deny: ["Edit", "Write"], defaultMode: "default" },
  });

  const text = result.resultText ?? "";
  const passed = /EVIDENCE:\s*pass/i.test(text) && !result.isError;
  const notes = text.split(/EVIDENCE:/i)[1]?.trim() || text.slice(-1000);
  await prisma.review.create({ data: { taskId, kind: "evidence", verdict: passed ? "pass" : "fail", notes } });
  await emitEvent(taskId, "review", { kind: "evidence", verdict: passed ? "pass" : "fail", notes });

  if (!passed) {
    await setStatus(taskId, "changes_requested");
    return;
  }
  await runChecker(taskId);
}

export async function runChecker(taskId: string): Promise<void> {
  const { task, harness } = await taskContext(taskId);
  const worktrees = await prisma.worktree.findMany({ where: { taskId } });

  let combinedPatch = "";
  for (const w of worktrees) {
    const diff = await wt.getDiff(w.path);
    combinedPatch += `\n===== ${w.path} =====\n${diff.patch}`;
  }
  const plan = await prisma.plan.findFirst({
    where: { taskId, status: "approved" },
    orderBy: { createdAt: "desc" },
  });

  const prompt = [
    "You are a senior reviewer with a FRESH perspective (you did NOT write this code).",
    "Review the diff for correctness, completeness against the plan, and obvious bugs.",
    "",
    `# Task\n${task.title}\n${task.description || ""}`,
    `\n# Plan\n${plan?.humanEdits || plan?.content || "(none)"}`,
    `\n# Diff\n\`\`\`diff\n${combinedPatch.slice(0, 40000)}\n\`\`\``,
    "\nEnd your response with EXACTLY one line, either:",
    "VERDICT: approved",
    "or",
    "VERDICT: changes_requested — <short reason>",
  ].join("\n");

  const worktreePaths = worktrees.map((w) => w.path);
  const result = await runAgent({
    taskId,
    role: "checker",
    prompt,
    cwd: worktreePaths[0] ?? config.repoRoot,
    additional: worktreePaths.slice(1),
    harness,
    permissionMode: "default",
    autoApprove: true, // checker is read-only; no human gate
    allowedTools: ["Read", "Grep", "Glob"],
    policyOverride: {
      allow: ["Read", "Grep", "Glob"],
      ask: [],
      deny: ["Edit", "Write", "Bash"],
      defaultMode: "default",
    },
  });

  const text = result.resultText ?? "";
  const approved = /VERDICT:\s*approved/i.test(text);
  const verdict = approved ? "approved" : "changes_requested";
  const notes = text.split(/VERDICT:/i)[1]?.trim() ?? text.slice(-500);
  await prisma.review.create({ data: { taskId, kind: "checker", verdict, notes } });
  await emitEvent(taskId, "review", { kind: "checker", verdict, notes });

  if (approved) {
    await setStatus(taskId, "human_review");
  } else {
    await setStatus(taskId, "changes_requested");
  }
}

export async function requestChanges(taskId: string, feedback: string): Promise<void> {
  // From changes_requested or human_review, loop back to executing with feedback.
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "human_review") {
    await setStatus(taskId, "changes_requested");
  }
  await prisma.review.create({
    data: { taskId, kind: "human", verdict: "changes_requested", notes: feedback },
  });
  const { project, harness } = await taskContext(taskId);
  const { cwd, additional } = await ensureWorktrees(taskId);
  await setStatus(taskId, "executing");
  const prompt = [
    "Apply the following requested changes to your work in the working directory.",
    "Do NOT commit — the platform commits.",
    "",
    `# Requested changes\n${feedback}`,
    project.memory ? `\n# Project context\n${project.memory}` : "",
    `\n# Working directories\n- ${cwd}${additional.map((a) => `\n- ${a}`).join("")}`,
  ].join("\n");
  const snaps = await snapshotWorktrees(taskId);
  try {
    const result = await runAgent({
      taskId,
      role: "maker",
      prompt,
      cwd,
      additional,
      harness,
      permissionMode: (harnessPolicy(harness).defaultMode as any) ?? "default",
      autoApprove: false,
    });
    if (result.isError) {
      await rollbackWorktrees(taskId, snaps);
      await failTask(taskId, new Error(result.resultText || "maker run errored"));
      return;
    }
    await setStatus(taskId, "checking");
    void runEvidence(taskId).catch((e) => failTask(taskId, e));
  } catch (err: any) {
    await rollbackWorktrees(taskId, snaps);
    await failTask(taskId, err);
  }
}

/** Human approves the diff → commit, and push+PR for repos with a remote. */
export async function approveAndFinalize(taskId: string): Promise<void> {
  const { task } = await taskContext(taskId);
  const worktrees = await prisma.worktree.findMany({ where: { taskId } });
  await prisma.review.create({ data: { taskId, kind: "human", verdict: "approved" } });
  await setStatus(taskId, "pr_open");

  for (const w of worktrees) {
    const repo = await prisma.repo.findUniqueOrThrow({ where: { id: w.repoId } });
    if (!(await wt.hasChanges(w.path))) continue;
    await wt.commitAll(w.path, `${task.title}\n\nvia Loop Engineering`);
    await prisma.worktree.update({ where: { id: w.id }, data: { status: "committed" } });

    if (repo.gitUrl) {
      try {
        await wt.push(w.path, w.branch);
        const { stdout } = await execAsync(
          `gh pr create --title ${JSON.stringify(task.title)} --body ${JSON.stringify(
            task.description || "Automated PR via Loop Engineering",
          )} --head ${w.branch}`,
          { cwd: w.path },
        );
        const url = stdout.trim();
        const num = Number(url.match(/\/pull\/(\d+)/)?.[1] ?? "0") || null;
        await prisma.pullRequest.create({
          data: { taskId, repoId: repo.id, number: num, url, branch: w.branch, status: "open" },
        });
        await emitEvent(taskId, "review", { kind: "pr", url });
      } catch (err: any) {
        await emitEvent(taskId, "error", { message: `PR creation failed: ${err.message}` });
      }
    }
  }
  await setStatus(taskId, "done");
}

export async function failTask(taskId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await prisma.task.update({ where: { id: taskId }, data: { status: "failed", error: message } }).catch(() => {});
  await emitEvent(taskId, "error", { message }).catch(() => {});
  emitStatus(taskId, "failed", { error: message });
  runManager.clearRun(taskId);
}

// ─────────────────────────── Live controls ───────────────────────────

export function sendGuidance(taskId: string, text: string): boolean {
  const handle = runManager.getRun(taskId);
  if (!handle) return false;
  handle.sendMessage(text);
  return true;
}

export async function interruptTask(taskId: string): Promise<boolean> {
  const handle = runManager.getRun(taskId);
  if (!handle) return false;
  await handle.interrupt();
  return true;
}

export function resolvePermission(requestId: string, allow: boolean, reason?: string): boolean {
  return runManager.resolvePermission(requestId, allow, reason);
}

// ─────────────────────────── Automations (triage loop) ───────────────────────────

/**
 * Run a scheduled triage: a read-only agent discovers work and returns a JSON
 * array of tasks, which we file into the backlog. The goal condition tells the
 * agent when to stop finding new work.
 */
export async function runAutomation(automationId: string): Promise<number> {
  const auto = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!auto) return 0;
  const project = await prisma.project.findUniqueOrThrow({ where: { id: auto.projectId } });
  const repo = await prisma.repo.findFirst({ where: { projectId: auto.projectId } });
  const cwd = repo ? await wt.ensureRepo({ name: repo.name, gitUrl: repo.gitUrl, localPath: repo.localPath }) : config.repoRoot;
  const harness = await prisma.harness.findFirst({ where: { projectId: auto.projectId, isDefault: true } });

  const prompt = [
    auto.triagePrompt,
    project.memory ? `\n# Project context\n${project.memory}` : "",
    auto.goalCondition ? `\n# Stop condition\n${auto.goalCondition}` : "",
    '\nOutput ONLY a JSON array of tasks to file, each { "title": string, "description": string }. No prose.',
  ].join("\n");

  const runner2 = new SessionRunner();
  const handle = runner2.start({
    prompt,
    cwd,
    permissionMode: "default",
    autoApprove: true,
    allowedTools: ["Read", "Grep", "Glob"],
    disallowedTools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "ExitPlanMode"],
    policy: { allow: ["Read", "Grep", "Glob", "Bash"], ask: [], deny: ["Edit", "Write"], defaultMode: "default" },
    model: harness?.model || undefined,
    settingSources: [],
    onEvent: async () => {},
    onPermission: async () => ({ allow: true }),
  });
  const result = await handle.done;

  let created = 0;
  const match = (result.resultText ?? "").match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const items = JSON.parse(match[0]) as Array<{ title: string; description?: string }>;
      for (const it of items.slice(0, 20)) {
        if (!it.title) continue;
        await prisma.task.create({
          data: {
            projectId: auto.projectId,
            title: it.title,
            description: it.description ?? "",
            createdBy: "automation",
            repoIds: repo ? [repo.id] : [],
          },
        });
        created++;
      }
    } catch {
      /* model returned non-JSON; skip */
    }
  }
  await prisma.automation.update({ where: { id: automationId }, data: { lastRunAt: new Date() } });
  return created;
}

export async function getTaskDiff(taskId: string) {
  const worktrees = await prisma.worktree.findMany({ where: { taskId } });
  const results = [];
  for (const w of worktrees) {
    const repo = await prisma.repo.findUnique({ where: { id: w.repoId } });
    const diff = await wt.getDiff(w.path);
    results.push({ worktreeId: w.id, repoName: repo?.name ?? "repo", branch: w.branch, ...diff });
  }
  return results;
}
