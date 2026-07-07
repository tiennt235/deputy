import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@loop/db";

/**
 * Write a project's enabled skills into a worktree's `.claude/skills/<name>/SKILL.md`
 * so the Agent SDK loads them via settingSources:["project"]. This is how
 * UI-managed skills change agent behaviour without re-explaining conventions.
 *
 * Additive: it does NOT clear the skills dir, so skills committed in the repo
 * (the source of truth) survive. A Deputy skill with the same name overrides the
 * repo's. Worktrees are fresh per task, so there is no stale-skill concern.
 */
export async function syncSkills(projectId: string, worktreePath: string): Promise<void> {
  const skills = await prisma.skill.findMany({ where: { projectId, enabled: true } });
  const skillsRoot = path.join(worktreePath, ".claude", "skills");
  for (const s of skills) {
    const dir = path.join(skillsRoot, s.name);
    await mkdir(dir, { recursive: true });
    const frontmatter = `---\nname: ${s.name}\ndescription: ${s.description.replace(/\n/g, " ")}\n---\n\n`;
    await writeFile(path.join(dir, "SKILL.md"), frontmatter + s.content, "utf8");
  }
}
