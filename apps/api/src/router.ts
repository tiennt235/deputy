import path from "node:path";
import { z } from "zod";
import { prisma } from "@loop/db";
import { DEFAULT_PERMISSION_POLICY } from "@loop/core";
import { router, publicProcedure } from "./trpc.js";
import * as orch from "./orchestrator.js";
import { reloadScheduler } from "./scheduler.js";
import { importClaudeSettings } from "./claudeSettings.js";
import { detectProject, scaffoldProject, suggestPaths } from "./onboarding.js";

/** The dirs whose `.claude/` settings feed a project's harness: root first, then each repo. */
async function importDirs(projectId: string): Promise<{ label: string; dir: string }[]> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { repos: true },
  });
  const dirs: { label: string; dir: string }[] = [];
  const seen = new Set<string>();
  const add = (label: string, dir: string) => {
    const abs = path.resolve(dir);
    if (seen.has(abs)) return;
    seen.add(abs);
    dirs.push({ label, dir });
  };
  if (project.rootPath) add("project root", project.rootPath);
  for (const r of project.repos) add(r.name, r.localPath);
  return dirs;
}

export const appRouter = router({
  // ─────────────── Onboarding wizard ───────────────
  onboarding: router({
    // Autocomplete real local directories as the user types a path.
    suggest: publicProcedure
      .input(z.object({ partial: z.string() }))
      .query(({ input }) => suggestPaths(input.partial)),
    // Read-only: inspect a local path and report what onboarding would do.
    detect: publicProcedure
      .input(z.object({ path: z.string().min(1) }))
      .query(({ input }) => detectProject(input.path)),
    // Confirmed action: create the dir (if missing) + git init with a base commit.
    scaffold: publicProcedure
      .input(z.object({ path: z.string().min(1) }))
      .mutation(({ input }) => scaffoldProject(input.path)),
  }),

  // ─────────────── Projects ───────────────
  projects: router({
    list: publicProcedure.query(() =>
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        include: { repos: true, _count: { select: { tasks: true } } },
      }),
    ),
    get: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
      prisma.project.findUnique({
        where: { id: input.id },
        include: { repos: true, harnesses: true, skills: true, connectors: true, automations: true },
      }),
    ),
    create: publicProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), memory: z.string().optional(), rootPath: z.string().optional() }))
      .mutation(async ({ input }) => {
        const project = await prisma.project.create({ data: input });
        // Every project gets a sensible default harness.
        await prisma.harness.create({
          data: {
            projectId: project.id,
            name: "Default",
            isDefault: true,
            permissionPolicy: DEFAULT_PERMISSION_POLICY as any,
            allowedTools: ["Read", "Grep", "Glob", "Edit", "Write"],
          },
        });
        return project;
      }),
    update: publicProcedure
      .input(z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional(), memory: z.string().optional(), rootPath: z.string().optional() }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return prisma.project.update({ where: { id }, data });
      }),
    delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      prisma.project.delete({ where: { id: input.id } }),
    ),

    // Preview what the repo `.claude/` settings would import into the harness (drift view).
    importPreview: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
      const dirs = await importDirs(input.id);
      const imported = await importClaudeSettings(dirs);
      const harness = await prisma.harness.findFirst({
        where: { projectId: input.id, isDefault: true },
      });
      return {
        imported,
        current: harness
          ? { model: harness.model, permissionPolicy: harness.permissionPolicy }
          : null,
      };
    }),

    // Apply the import: repo `.claude/` → default harness (policy, model, subagents) + connectors.
    // Skills/CLAUDE.md stay repo-native (loaded by the SDK via settingSources), so they are not
    // copied into the DB — they are only reported so you can see what was found.
    importApply: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      const dirs = await importDirs(input.id);
      const imported = await importClaudeSettings(dirs);
      const harness =
        (await prisma.harness.findFirst({ where: { projectId: input.id, isDefault: true } })) ??
        (await prisma.harness.findFirst({ where: { projectId: input.id } }));
      if (!harness) throw new Error("Project has no harness to import into");

      await prisma.harness.update({
        where: { id: harness.id },
        data: {
          model: imported.model ?? harness.model,
          permissionPolicy: imported.permissionPolicy as any,
          subagents: imported.subagents as any,
        },
      });

      for (const c of imported.connectors) {
        const existing = await prisma.connector.findFirst({
          where: { projectId: input.id, name: c.name },
        });
        if (existing) {
          await prisma.connector.update({ where: { id: existing.id }, data: { type: c.type, config: c.config as any } });
        } else {
          await prisma.connector.create({ data: { projectId: input.id, name: c.name, type: c.type, config: c.config as any } });
        }
      }

      return {
        sources: imported.sources,
        model: imported.model,
        permissionPolicy: imported.permissionPolicy,
        connectors: imported.connectors.length,
        subagents: Object.keys(imported.subagents).length,
        skills: imported.skills, // repo-native; reported only
      };
    }),
  }),

  // ─────────────── Repos ───────────────
  repos: router({
    create: publicProcedure
      .input(
        z.object({
          projectId: z.string(),
          name: z.string().min(1),
          gitUrl: z.string().optional(),
          localPath: z.string().min(1),
          kind: z.enum(["mono", "poly_member"]).default("mono"),
          defaultBranch: z.string().default("main"),
        }),
      )
      .mutation(({ input }) => prisma.repo.create({ data: input })),
    delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      prisma.repo.delete({ where: { id: input.id } }),
    ),
  }),

  // ─────────────── Harness ───────────────
  harness: router({
    list: publicProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      prisma.harness.findMany({ where: { projectId: input.projectId } }),
    ),
    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          model: z.string().optional(),
          allowedTools: z.array(z.string()).optional(),
          systemPromptAppend: z.string().optional(),
          permissionPolicy: z.any().optional(),
        }),
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return prisma.harness.update({ where: { id }, data: data as any });
      }),
  }),

  // ─────────────── Skills ───────────────
  skills: router({
    list: publicProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      prisma.skill.findMany({ where: { projectId: input.projectId }, orderBy: { name: "asc" } }),
    ),
    upsert: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          projectId: z.string(),
          name: z.string().min(1),
          description: z.string().default(""),
          content: z.string().default(""),
          enabled: z.boolean().default(true),
        }),
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return id
          ? prisma.skill.update({ where: { id }, data })
          : prisma.skill.create({ data });
      }),
    delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      prisma.skill.delete({ where: { id: input.id } }),
    ),
  }),

  // ─────────────── Connectors (MCP) ───────────────
  connectors: router({
    list: publicProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      prisma.connector.findMany({ where: { projectId: input.projectId } }),
    ),
    upsert: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          projectId: z.string(),
          name: z.string(),
          type: z.string(),
          config: z.any(),
          enabled: z.boolean().default(true),
        }),
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return id
          ? prisma.connector.update({ where: { id }, data: data as any })
          : prisma.connector.create({ data: data as any });
      }),
  }),

  // ─────────────── Automations ───────────────
  automations: router({
    list: publicProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      prisma.automation.findMany({ where: { projectId: input.projectId } }),
    ),
    upsert: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          projectId: z.string(),
          name: z.string(),
          cron: z.string(),
          triagePrompt: z.string(),
          goalCondition: z.string().default(""),
          enabled: z.boolean().default(false),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const row = id
          ? await prisma.automation.update({ where: { id }, data })
          : await prisma.automation.create({ data });
        await reloadScheduler();
        return row;
      }),
    runNow: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => ({
      created: await orch.runAutomation(input.id),
    })),
  }),

  // ─────────────── Tasks ───────────────
  tasks: router({
    listByProject: publicProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      prisma.task.findMany({
        where: { projectId: input.projectId },
        orderBy: { updatedAt: "desc" },
        include: { reviews: true },
      }),
    ),
    board: publicProcedure.query(() =>
      prisma.task.findMany({
        orderBy: { updatedAt: "desc" },
        include: { project: { select: { name: true } } },
      }),
    ),
    attention: publicProcedure.query(async () => {
      const gates = await prisma.task.findMany({
        where: { status: { in: ["plan_review", "human_review"] } },
        orderBy: { updatedAt: "asc" },
        include: { project: { select: { name: true } } },
      });
      const perms = await prisma.permissionRequest.findMany({
        where: { status: "pending" },
        include: { task: { select: { title: true, projectId: true } } },
      });
      return { gates, permissions: perms };
    }),
    get: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
      prisma.task.findUnique({
        where: { id: input.id },
        include: {
          project: true,
          plans: { orderBy: { createdAt: "desc" } },
          reviews: { orderBy: { createdAt: "desc" } },
          runs: { orderBy: { createdAt: "desc" } },
          worktrees: true,
          permissions: { where: { status: "pending" } },
          prs: true,
        },
      }),
    ),
    events: publicProcedure.input(z.object({ taskId: z.string() })).query(({ input }) =>
      prisma.agentEvent.findMany({
        where: { taskId: input.taskId },
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
    ),
    diff: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
      orch.getTaskDiff(input.id),
    ),
    create: publicProcedure
      .input(
        z.object({
          projectId: z.string(),
          title: z.string().min(1),
          description: z.string().default(""),
          harnessId: z.string().optional(),
          repoIds: z.array(z.string()).default([]),
        }),
      )
      .mutation(({ input }) => prisma.task.create({ data: input })),

    // ─────────────── Lifecycle actions ───────────────
    start: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
      void orch.startPlanning(input.id).catch((e) => orch.failTask(input.id, e));
      return { started: true };
    }),
    approvePlan: publicProcedure
      .input(z.object({ id: z.string(), editedContent: z.string().optional() }))
      .mutation(({ input }) => {
        void orch.approvePlan(input.id, input.editedContent);
        return { ok: true };
      }),
    rejectPlan: publicProcedure
      .input(z.object({ id: z.string(), feedback: z.string().optional() }))
      .mutation(({ input }) => {
        void orch.rejectPlan(input.id, input.feedback);
        return { ok: true };
      }),
    approveDiff: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
      void orch.approveAndFinalize(input.id).catch((e) => orch.failTask(input.id, e));
      return { ok: true };
    }),
    requestChanges: publicProcedure
      .input(z.object({ id: z.string(), feedback: z.string() }))
      .mutation(({ input }) => {
        void orch.requestChanges(input.id, input.feedback).catch((e) => orch.failTask(input.id, e));
        return { ok: true };
      }),
    guide: publicProcedure
      .input(z.object({ id: z.string(), text: z.string() }))
      .mutation(({ input }) => ({ delivered: orch.sendGuidance(input.id, input.text) })),
    interrupt: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      orch.interruptTask(input.id).then((ok) => ({ ok })),
    ),
    resolvePermission: publicProcedure
      .input(z.object({ requestId: z.string(), allow: z.boolean(), reason: z.string().optional() }))
      .mutation(({ input }) => ({
        resolved: orch.resolvePermission(input.requestId, input.allow, input.reason),
      })),
  }),
});

export type AppRouter = typeof appRouter;
