import { prisma } from "@loop/db";
import { appRouter } from "./router.js";
import { bus } from "./bus.js";
import * as orch from "./orchestrator.js";

const REPO = process.argv[2];
const caller = appRouter.createCaller({});

function log(...a: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

async function waitFor(taskId: string, statuses: string[], timeoutMs: number): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    if (statuses.includes(t.status)) return t.status;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  throw new Error(`timeout waiting for ${statuses} — stuck at ${t.status} (${t.error ?? ""})`);
}

async function main() {
  // Auto-answer permission requests to keep the loop autonomous for the test.
  bus.subscribeAll((msg) => {
    const e = msg.event;
    if (e.type === "permission_request") {
      log("  → auto-allowing permission:", (e.payload as any).toolName);
      orch.resolvePermission((e.payload as any).id, true);
    } else if (["tool_use", "review", "plan_proposed", "error", "result", "status"].includes(e.type)) {
      const p = e.payload as any;
      const summary =
        e.type === "tool_use" ? p.name :
        e.type === "status" ? p.status :
        e.type === "review" ? `${p.kind} ${p.verdict}` :
        e.type === "error" ? p.message :
        e.type === "result" ? `$${p.total_cost_usd}` : "";
      log(`  [${e.type}]`, summary);
    }
  });

  log("Creating project…");
  const project = await caller.projects.create({ name: "E2E Test", description: "smoke" });
  const repo = await caller.repos.create({ projectId: project.id, name: "calc", localPath: REPO, kind: "mono" });
  const task = await caller.tasks.create({
    projectId: project.id,
    title: "Add a subtract function",
    description: "Add a subtract(a, b) function to calc.py that returns a - b. Keep it simple.",
    repoIds: [repo.id],
  });
  log("Task:", task.id);

  log("Starting loop (planning)…");
  await caller.tasks.start({ id: task.id });
  const planStatus = await waitFor(task.id, ["plan_review", "failed"], 180000);
  if (planStatus === "failed") {
    const t = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    throw new Error("planning failed: " + t.error);
  }
  const plan = await prisma.plan.findFirst({ where: { taskId: task.id }, orderBy: { createdAt: "desc" } });
  log("PLAN (first 200 chars):", (plan?.content ?? "").slice(0, 200).replace(/\n/g, " "));

  log("Approving plan → executing…");
  await caller.tasks.approvePlan({ id: task.id });
  const reached = await waitFor(task.id, ["human_review", "changes_requested", "failed"], 240000);
  log("Reached:", reached);

  const diff = await orch.getTaskDiff(task.id);
  log("DIFF files:", diff.map((d) => d.files.map((f) => `${f.status} ${f.path} +${f.additions}/-${f.deletions}`)).flat());

  if (reached === "human_review") {
    log("Approving diff → finalize…");
    await caller.tasks.approveDiff({ id: task.id });
    const final = await waitFor(task.id, ["done", "failed"], 60000);
    log("FINAL STATUS:", final);
    const commits = diff.length;
    log("Worktrees committed:", commits);
  }

  const finalTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { runs: true } });
  log("Total cost: $" + finalTask.costUsd.toFixed(4), "| runs:", finalTask.runs.map((r) => `${r.role}:${r.status}`).join(", "));
  log("DONE ✓");
  process.exit(0);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
