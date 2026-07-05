import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, Prisma } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const demoRepo = path.join(repoRoot, ".data/repos/demo-calc");

function sh(cmd: string, cwd: string) {
  execSync(cmd, { cwd, stdio: "ignore" });
}

async function main() {
  // 1. Create a small local demo repo the agent can work in.
  if (!existsSync(path.join(demoRepo, ".git"))) {
    mkdirSync(demoRepo, { recursive: true });
    writeFileSync(path.join(demoRepo, "calc.py"), "def add(a, b):\n    return a + b\n");
    writeFileSync(path.join(demoRepo, "README.md"), "# Calc\nA tiny calculator library.\n");
    sh("git init -q", demoRepo);
    sh('git -c user.email=demo@loop -c user.name=Loop add -A', demoRepo);
    sh('git -c user.email=demo@loop -c user.name=Loop commit -qm "init"', demoRepo);
  }

  // 2. Create the demo project + repo + default harness.
  const existing = await prisma.project.findFirst({ where: { name: "Demo: Calculator" } });
  if (existing) {
    console.log("Demo project already exists:", existing.id);
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: "Demo: Calculator",
      description: "A tiny repo to try the loop end-to-end.",
      memory: "This is a minimal Python library. Keep functions small and mirror the existing style.",
    },
  });
  await prisma.harness.create({
    data: {
      projectId: project.id,
      name: "Default",
      isDefault: true,
      model: "sonnet",
      permissionPolicy: {
        allow: ["Read", "Grep", "Glob", "Bash(git status)", "Bash(ls *)"],
        ask: [],
        deny: ["Bash(rm -rf /*)", "Bash(sudo *)"],
        defaultMode: "default",
      } as Prisma.InputJsonValue,
      allowedTools: ["Read", "Grep", "Glob", "Edit", "Write"],
    },
  });
  await prisma.repo.create({
    data: { projectId: project.id, name: "demo-calc", localPath: demoRepo, kind: "mono", defaultBranch: "master" },
  });
  await prisma.skill.create({
    data: {
      projectId: project.id,
      name: "python-style",
      description: "Conventions for this Python library",
      content: "## Python style\n- Keep functions tiny and pure.\n- Mirror the signature style of existing functions.\n- No external dependencies.",
    },
  });

  console.log("Seeded demo project:", project.id);
  console.log("Repo:", demoRepo);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
