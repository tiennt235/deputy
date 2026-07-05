import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { StatusPill, money, ago, Empty } from "../ui";

type Tab = "tasks" | "repos" | "harness" | "skills" | "connectors" | "automations" | "memory";

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const project = trpc.projects.get.useQuery({ id: id! });
  const [tab, setTab] = useState<Tab>("tasks");

  if (!project.data) return <div className="content">Loading…</div>;
  const p = project.data;

  return (
    <>
      <div className="topbar">
        <span className="faint" style={{ cursor: "pointer" }} onClick={() => nav("/projects")}>
          Projects /
        </span>
        <h1>{p.name}</h1>
      </div>
      <div className="content">
        <div className="tabs">
          {(["tasks", "repos", "harness", "skills", "connectors", "automations", "memory"] as Tab[]).map((t) => (
            <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        {tab === "tasks" && <TasksTab projectId={p.id} repos={p.repos} onOpen={(tid) => nav(`/tasks/${tid}`)} />}
        {tab === "repos" && <ReposTab projectId={p.id} repos={p.repos} refetch={project.refetch} />}
        {tab === "harness" && <HarnessTab projectId={p.id} />}
        {tab === "skills" && <SkillsTab projectId={p.id} />}
        {tab === "connectors" && <ConnectorsTab projectId={p.id} />}
        {tab === "automations" && <AutomationsTab projectId={p.id} />}
        {tab === "memory" && <MemoryTab project={p} refetch={project.refetch} />}
      </div>
    </>
  );
}

function TasksTab({ projectId, repos, onOpen }: { projectId: string; repos: any[]; onOpen: (id: string) => void }) {
  const tasks = trpc.tasks.listByProject.useQuery({ projectId }, { refetchInterval: 4000 });
  const create = trpc.tasks.create.useMutation({ onSuccess: () => tasks.refetch() });
  const start = trpc.tasks.start.useMutation({ onSuccess: () => tasks.refetch() });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repoIds, setRepoIds] = useState<string[]>([]);

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 340px" }}>
      <div className="col">
        {(tasks.data?.length ?? 0) === 0 ? (
          <Empty>No tasks yet. Delegate the first one →</Empty>
        ) : (
          tasks.data!.map((t) => (
            <div className="list-row" key={t.id} style={{ cursor: "pointer" }} onClick={() => onOpen(t.id)}>
              <StatusPill status={t.status} />
              <div className="col" style={{ gap: 2 }}>
                <b>{t.title}</b>
                <span className="faint" style={{ fontSize: 12 }}>
                  {money(t.costUsd)} · {ago(t.updatedAt)}
                </span>
              </div>
              <span className="spacer" />
              {t.status === "backlog" && (
                <button
                  className="btn sm primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    start.mutate({ id: t.id });
                  }}
                >
                  Start loop
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Delegate a task</h2>
        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add rate limiting to the API" />
        </div>
        <div className="field">
          <label>Outcome (what & why, not step-by-step)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the desired result and the reasoning behind it. The agent plans the steps."
          />
        </div>
        <div className="field">
          <label>Repos in scope {repos.length === 0 && <span className="faint">(add a repo first)</span>}</label>
          <div className="col" style={{ gap: 5 }}>
            {repos.map((r) => (
              <label key={r.id} className="row" style={{ cursor: "pointer", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={repoIds.includes(r.id)}
                  onChange={(e) =>
                    setRepoIds((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)))
                  }
                />
                {r.name} <span className="faint mono">{r.kind}</span>
              </label>
            ))}
          </div>
        </div>
        <button
          className="btn primary"
          disabled={!title || create.isPending}
          onClick={async () => {
            await create.mutateAsync({ projectId, title, description, repoIds });
            setTitle("");
            setDescription("");
            setRepoIds([]);
          }}
        >
          Create task
        </button>
      </div>
    </div>
  );
}

function ReposTab({ projectId, repos, refetch }: { projectId: string; repos: any[]; refetch: () => void }) {
  const create = trpc.repos.create.useMutation({ onSuccess: () => refetch() });
  const del = trpc.repos.delete.useMutation({ onSuccess: () => refetch() });
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [kind, setKind] = useState<"mono" | "poly_member">("mono");

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 340px" }}>
      <div className="col">
        {repos.length === 0 ? (
          <Empty>No repos. Register a local path or git URL — mono or multi-repo, agnostic.</Empty>
        ) : (
          repos.map((r) => (
            <div className="list-row" key={r.id}>
              <div className="col" style={{ gap: 2 }}>
                <b>{r.name}</b>
                <span className="faint mono" style={{ fontSize: 12 }}>
                  {r.localPath} · {r.kind} · {r.gitUrl ? "remote" : "local-only"}
                </span>
              </div>
              <span className="spacer" />
              <button className="btn sm bad" onClick={() => del.mutate({ id: r.id })}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>
      <div className="card">
        <h2>Add repo</h2>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="api" />
        </div>
        <div className="field">
          <label>Local path (absolute)</label>
          <input value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/home/you/code/api" />
        </div>
        <div className="field">
          <label>Git URL (optional — enables push + PR)</label>
          <input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="git@github.com:org/api.git" />
        </div>
        <div className="field">
          <label>Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="mono">mono (standalone repo)</option>
            <option value="poly_member">poly_member (one of several)</option>
          </select>
        </div>
        <button
          className="btn primary"
          disabled={!name || !localPath || create.isPending}
          onClick={async () => {
            await create.mutateAsync({ projectId, name, localPath, gitUrl: gitUrl || undefined, kind });
            setName("");
            setGitUrl("");
            setLocalPath("");
          }}
        >
          Add repo
        </button>
      </div>
    </div>
  );
}

function HarnessTab({ projectId }: { projectId: string }) {
  const list = trpc.harness.list.useQuery({ projectId });
  const update = trpc.harness.update.useMutation({ onSuccess: () => list.refetch() });
  const h = list.data?.[0];
  const [model, setModel] = useState<string | null>(null);
  const [tools, setTools] = useState<string | null>(null);
  const [sys, setSys] = useState<string | null>(null);
  const [policy, setPolicy] = useState<string | null>(null);
  if (!h) return <div className="muted">Loading harness…</div>;

  const modelV = model ?? h.model;
  const toolsV = tools ?? h.allowedTools.join(", ");
  const sysV = sys ?? h.systemPromptAppend;
  const policyV = policy ?? JSON.stringify(h.permissionPolicy, null, 2);

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h2>{h.name} harness</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        The harness is the agent's runtime config: model, auto-approved tools, permission policy, and a
        system-prompt append that carries project conventions into every run.
      </p>
      <div className="field">
        <label>Model</label>
        <input value={modelV} onChange={(e) => setModel(e.target.value)} placeholder="sonnet | opus | haiku" />
      </div>
      <div className="field">
        <label>Auto-approved tools (comma separated)</label>
        <input value={toolsV} onChange={(e) => setTools(e.target.value)} placeholder="Read, Grep, Glob, Edit, Write" />
      </div>
      <div className="field">
        <label>System prompt append</label>
        <textarea value={sysV} onChange={(e) => setSys(e.target.value)} placeholder="Project-wide conventions the agent should always follow…" />
      </div>
      <div className="field">
        <label>Permission policy (JSON: allow / ask / deny / defaultMode)</label>
        <textarea className="mono" style={{ minHeight: 140 }} value={policyV} onChange={(e) => setPolicy(e.target.value)} />
      </div>
      <button
        className="btn primary"
        disabled={update.isPending}
        onClick={() => {
          let parsed: any = undefined;
          try {
            parsed = JSON.parse(policyV);
          } catch {
            alert("Permission policy is not valid JSON");
            return;
          }
          update.mutate({
            id: h.id,
            model: modelV,
            allowedTools: toolsV.split(",").map((s) => s.trim()).filter(Boolean),
            systemPromptAppend: sysV,
            permissionPolicy: parsed,
          });
        }}
      >
        Save harness
      </button>
      {update.isSuccess && <span className="muted" style={{ marginLeft: 12 }}>Saved ✓</span>}
    </div>
  );
}

function SkillsTab({ projectId }: { projectId: string }) {
  const list = trpc.skills.list.useQuery({ projectId });
  const upsert = trpc.skills.upsert.useMutation({ onSuccess: () => list.refetch() });
  const del = trpc.skills.delete.useMutation({ onSuccess: () => list.refetch() });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 380px" }}>
      <div className="col">
        {(list.data?.length ?? 0) === 0 ? (
          <Empty>No skills. Skills (SKILL.md) are reusable project knowledge synced into every worktree.</Empty>
        ) : (
          list.data!.map((s) => (
            <div className="list-row" key={s.id}>
              <div className="col" style={{ gap: 2 }}>
                <b>{s.name}</b>
                <span className="faint" style={{ fontSize: 12 }}>{s.description || "(no description)"}</span>
              </div>
              <span className="spacer" />
              <button className="btn sm bad" onClick={() => del.mutate({ id: s.id })}>Delete</button>
            </div>
          ))
        )}
      </div>
      <div className="card">
        <h2>New skill</h2>
        <div className="field">
          <label>Name (kebab-case)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="run-tests" />
        </div>
        <div className="field">
          <label>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="How to run the test suite" />
        </div>
        <div className="field">
          <label>SKILL.md body</label>
          <textarea style={{ minHeight: 160 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="## Steps&#10;1. pnpm install&#10;2. pnpm test" />
        </div>
        <button
          className="btn primary"
          disabled={!name || upsert.isPending}
          onClick={async () => {
            await upsert.mutateAsync({ projectId, name, description, content });
            setName(""); setDescription(""); setContent("");
          }}
        >
          Add skill
        </button>
      </div>
    </div>
  );
}

function ConnectorsTab({ projectId }: { projectId: string }) {
  const list = trpc.connectors.list.useQuery({ projectId });
  const upsert = trpc.connectors.upsert.useMutation({ onSuccess: () => list.refetch() });
  const [name, setName] = useState("");
  const [config, setConfig] = useState('{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-github"]\n}');

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 380px" }}>
      <div className="col">
        {(list.data?.length ?? 0) === 0 ? (
          <Empty>No connectors. Attach MCP servers (GitHub, DB, Slack…) so agents act beyond the filesystem.</Empty>
        ) : (
          list.data!.map((c) => (
            <div className="list-row" key={c.id}>
              <div className="col" style={{ gap: 2 }}>
                <b>{c.name}</b>
                <span className="faint mono" style={{ fontSize: 12 }}>{c.type}</span>
              </div>
              <span className="spacer" />
              <span className={`pill ${c.enabled ? "st-done" : "st-backlog"}`}>{c.enabled ? "enabled" : "off"}</span>
            </div>
          ))
        )}
      </div>
      <div className="card">
        <h2>Add MCP connector</h2>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="github" />
        </div>
        <div className="field">
          <label>Server config (JSON)</label>
          <textarea className="mono" style={{ minHeight: 140 }} value={config} onChange={(e) => setConfig(e.target.value)} />
        </div>
        <button
          className="btn primary"
          disabled={!name || upsert.isPending}
          onClick={async () => {
            let parsed: any;
            try { parsed = JSON.parse(config); } catch { alert("Config is not valid JSON"); return; }
            await upsert.mutateAsync({ projectId, name, type: "stdio", config: parsed });
            setName("");
          }}
        >
          Add connector
        </button>
      </div>
    </div>
  );
}

function AutomationsTab({ projectId }: { projectId: string }) {
  const list = trpc.automations.list.useQuery({ projectId });
  const upsert = trpc.automations.upsert.useMutation({ onSuccess: () => list.refetch() });
  const runNow = trpc.automations.runNow.useMutation({ onSuccess: (r) => { alert(`Filed ${r.created} task(s)`); list.refetch(); } });
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [triagePrompt, setTriagePrompt] = useState("");
  const [goalCondition, setGoalCondition] = useState("");

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 380px" }}>
      <div className="col">
        {(list.data?.length ?? 0) === 0 ? (
          <Empty>No automations. Schedule discovery/triage that files tasks on its own, halting on a goal.</Empty>
        ) : (
          list.data!.map((a) => (
            <div className="list-row" key={a.id}>
              <div className="col" style={{ gap: 2 }}>
                <b>{a.name}</b>
                <span className="faint mono" style={{ fontSize: 12 }}>{a.cron}</span>
              </div>
              <span className="spacer" />
              <button className="btn sm" disabled={runNow.isPending} onClick={() => runNow.mutate({ id: a.id })}>
                {runNow.isPending ? "Running…" : "Run now"}
              </button>
              <button className="btn sm" onClick={() => upsert.mutate({ id: a.id, projectId, name: a.name, cron: a.cron, triagePrompt: a.triagePrompt, goalCondition: a.goalCondition, enabled: !a.enabled })}>
                {a.enabled ? "Disable" : "Enable"}
              </button>
              <span className={`pill ${a.enabled ? "st-done" : "st-backlog"}`}>{a.enabled ? "on" : "off"}</span>
            </div>
          ))
        )}
      </div>
      <div className="card">
        <h2>New automation</h2>
        <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly triage" /></div>
        <div className="field"><label>Cron</label><input className="mono" value={cron} onChange={(e) => setCron(e.target.value)} /></div>
        <div className="field"><label>Triage prompt</label><textarea value={triagePrompt} onChange={(e) => setTriagePrompt(e.target.value)} placeholder="Scan open issues and file a task for each actionable bug." /></div>
        <div className="field"><label>Goal / stop condition</label><input value={goalCondition} onChange={(e) => setGoalCondition(e.target.value)} placeholder="Stop when no new actionable issues remain." /></div>
        <button className="btn primary" disabled={!name || upsert.isPending} onClick={async () => { await upsert.mutateAsync({ projectId, name, cron, triagePrompt, goalCondition }); setName(""); }}>
          Add automation
        </button>
      </div>
    </div>
  );
}

function MemoryTab({ project, refetch }: { project: any; refetch: () => void }) {
  const update = trpc.projects.update.useMutation({ onSuccess: () => refetch() });
  const [memory, setMemory] = useState<string | null>(null);
  const v = memory ?? project.memory;
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h2>Project memory</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Persistent context injected into every planning and execution run — architecture notes,
        conventions, and constraints the models forget between runs.
      </p>
      <textarea style={{ minHeight: 260 }} value={v} onChange={(e) => setMemory(e.target.value)} />
      <div style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={update.isPending} onClick={() => update.mutate({ id: project.id, memory: v })}>
          Save memory
        </button>
        {update.isSuccess && <span className="muted" style={{ marginLeft: 12 }}>Saved ✓</span>}
      </div>
    </div>
  );
}
