import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_PERMISSION_POLICY, type PermissionPolicy } from "@loop/core";

/**
 * Reads Claude Code project settings (`.claude/settings.json`, `.mcp.json`,
 * `.claude/agents`, `.claude/skills`) from one or more local dirs and merges
 * them into a Deputy-harness shape. Source of truth is the repo; this powers
 * the "Import from repo(s)" onboarding + re-sync flow.
 *
 * Merge rules (first source wins on scalar conflicts; the project root is passed
 * first, then each member repo): permission lists are unioned, `defaultMode` is
 * the most restrictive present, `model` is the first non-empty.
 */

export interface ClaudeAgent {
  description?: string;
  prompt: string;
  tools?: string[];
  model?: string;
}

export interface ImportSource {
  label: string;
  dir: string;
  found: boolean; // whether any .claude/.mcp config existed here
}

export interface ImportResult {
  sources: ImportSource[];
  model?: string;
  permissionPolicy: PermissionPolicy;
  connectors: { name: string; type: string; config: Record<string, unknown> }[];
  subagents: Record<string, ClaudeAgent>;
  skills: { name: string; description: string }[];
}

interface RawSource {
  label: string;
  dir: string;
  found: boolean;
  model?: string;
  permissions?: { allow?: string[]; ask?: string[]; deny?: string[]; defaultMode?: string };
  mcpServers?: Record<string, any>;
  agents: Record<string, ClaudeAgent>;
  skills: { name: string; description: string }[];
}

async function readJson(file: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** Split `---\nfrontmatter\n---\nbody` into a shallow key map + the body. */
function parseFrontmatter(text: string): { fm: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { fm, body: m[2].trim() };
}

async function readSource(label: string, dir: string): Promise<RawSource> {
  const claude = path.join(dir, ".claude");
  const src: RawSource = { label, dir, found: false, agents: {}, skills: [] };

  // settings.json + settings.local.json (local overrides project within a dir)
  const settings = await readJson(path.join(claude, "settings.json"));
  const local = await readJson(path.join(claude, "settings.local.json"));
  const merged = { ...(settings ?? {}), ...(local ?? {}) };
  if (settings || local) {
    src.found = true;
    if (typeof merged.model === "string") src.model = merged.model;
    if (merged.permissions && typeof merged.permissions === "object") src.permissions = merged.permissions;
  }

  // .mcp.json (project-scoped MCP servers)
  const mcp = await readJson(path.join(dir, ".mcp.json"));
  if (mcp?.mcpServers && typeof mcp.mcpServers === "object") {
    src.found = true;
    src.mcpServers = mcp.mcpServers;
  }

  // .claude/agents/*.md → subagents
  const agentFiles = await readdir(path.join(claude, "agents")).catch(() => [] as string[]);
  for (const f of agentFiles) {
    if (!f.endsWith(".md")) continue;
    const { fm, body } = parseFrontmatter(await readFile(path.join(claude, "agents", f), "utf8").catch(() => ""));
    const name = fm.name || f.replace(/\.md$/, "");
    if (!body) continue;
    src.found = true;
    src.agents[name] = {
      description: fm.description || undefined,
      prompt: body,
      tools: fm.tools ? fm.tools.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      model: fm.model || undefined,
    };
  }

  // .claude/skills/*/SKILL.md → skills (name + description only; body stays in the repo)
  const skillDirs = await readdir(path.join(claude, "skills"), { withFileTypes: true }).catch(() => []);
  for (const d of skillDirs) {
    if (!d.isDirectory()) continue;
    const { fm } = parseFrontmatter(
      await readFile(path.join(claude, "skills", d.name, "SKILL.md"), "utf8").catch(() => ""),
    );
    src.found = true;
    src.skills.push({ name: fm.name || d.name, description: fm.description || "" });
  }

  return src;
}

const MODE_RANK: Record<string, number> = {
  plan: 4,
  default: 3,
  acceptEdits: 2,
  dontAsk: 1,
  bypassPermissions: 0,
};

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Read + merge `.claude` settings from the given dirs. Pass the project root
 * first, then each member repo dir; earlier sources win on scalar conflicts.
 */
export async function importClaudeSettings(dirs: { label: string; dir: string }[]): Promise<ImportResult> {
  const sources = await Promise.all(dirs.map((d) => readSource(d.label, d.dir)));

  const allow: string[] = [];
  const ask: string[] = [];
  const deny: string[] = [];
  let mode: string | undefined;
  let model: string | undefined;
  const connectors = new Map<string, { name: string; type: string; config: Record<string, unknown> }>();
  const subagents: Record<string, ClaudeAgent> = {};
  const skills = new Map<string, { name: string; description: string }>();

  for (const s of sources) {
    if (!model && s.model) model = s.model;
    if (s.permissions) {
      allow.push(...(s.permissions.allow ?? []));
      ask.push(...(s.permissions.ask ?? []));
      deny.push(...(s.permissions.deny ?? []));
      const m = s.permissions.defaultMode;
      if (m && (mode === undefined || (MODE_RANK[m] ?? 3) > (MODE_RANK[mode] ?? 3))) mode = m;
    }
    for (const [name, cfg] of Object.entries(s.mcpServers ?? {})) {
      if (connectors.has(name)) continue; // first source (root) wins
      const type = (cfg as any)?.type ?? ((cfg as any)?.url ? "http" : "stdio");
      connectors.set(name, { name, type, config: cfg as Record<string, unknown> });
    }
    for (const [name, agent] of Object.entries(s.agents)) {
      if (!(name in subagents)) subagents[name] = agent; // root wins
    }
    for (const sk of s.skills) if (!skills.has(sk.name)) skills.set(sk.name, sk);
  }

  const permissionPolicy: PermissionPolicy = {
    allow: uniq(allow),
    ask: uniq(ask),
    deny: uniq(deny),
    defaultMode: (mode as PermissionPolicy["defaultMode"]) ?? DEFAULT_PERMISSION_POLICY.defaultMode,
  };

  return {
    sources: sources.map((s) => ({ label: s.label, dir: s.dir, found: s.found })),
    model,
    permissionPolicy,
    connectors: [...connectors.values()],
    subagents,
    skills: [...skills.values()],
  };
}
