import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { clickable } from "../ui";

type StepKey = "scaffold" | "project" | "import";
interface Step {
  key: StepKey;
  label: string;
  detail?: string;
}
type Status = "pending" | "running" | "done" | "error";

const MODE_LABEL: Record<string, string> = {
  missing: "New — will be created",
  "existing-plain": "Exists, no git — will initialize",
  "existing-single": "Existing git repo",
  "existing-multi": "Multi-repo directory",
  invalid: "Not a directory",
};

/**
 * Confirm-gated onboarding wizard. Enter a local path → detect → the platform
 * builds an ordered list of actions (scaffold / create+register / import) and
 * the user must confirm each one before it runs.
 */
export function NewProjectWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const nav = useNavigate();
  const [pathInput, setPathInput] = useState("");
  const [detection, setDetection] = useState<any>(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [idx, setIdx] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const detect = trpc.onboarding.detect.useQuery({ path: pathInput }, { enabled: false });
  const suggest = trpc.onboarding.suggest.useQuery(
    { partial: pathInput },
    { enabled: !detection, placeholderData: (prev) => prev },
  );
  const scaffold = trpc.onboarding.scaffold.useMutation();
  const createProject = trpc.projects.create.useMutation();
  const createRepo = trpc.repos.create.useMutation();
  const importApply = trpc.projects.importApply.useMutation();

  const phase: "path" | "plan" | "done" = !detection ? "path" : idx >= steps.length ? "done" : "plan";
  const busy = detect.isFetching || scaffold.isPending || createProject.isPending || createRepo.isPending || importApply.isPending;

  async function runDetect() {
    setErr(null);
    const res = await detect.refetch();
    const d = res.data;
    if (!d) return setErr("Could not read that path.");
    if (d.mode === "invalid") return setErr(`${d.path} is not a directory.`);
    const anyClaude = d.hasClaudeAtRoot || d.repos.some((r: any) => r.hasClaude);
    const s: Step[] = [];
    if (d.needsScaffold)
      s.push({
        key: "scaffold",
        label: d.mode === "missing" ? "Create directory & initialize git" : "Initialize git in this directory",
        detail: d.path,
      });
    s.push({
      key: "project",
      label: `Create project & register ${d.repos.length} repo${d.repos.length === 1 ? "" : "s"}`,
      detail: d.repos.map((r: any) => r.name).join(", ") || "—",
    });
    if (anyClaude) s.push({ key: "import", label: "Import .claude settings into the harness", detail: "permissions · model · subagents · connectors" });
    setDetection(d);
    setName(d.suggestedName);
    setSteps(s);
    setIdx(0);
    setStatuses({});
    setProjectId(null);
  }

  async function confirmStep() {
    const step = steps[idx];
    setErr(null);
    setStatuses((p) => ({ ...p, [step.key]: "running" }));
    try {
      if (step.key === "scaffold") {
        setDetection(await scaffold.mutateAsync({ path: pathInput }));
      } else if (step.key === "project") {
        const proj = await createProject.mutateAsync({ name, rootPath: detection.path });
        setProjectId(proj.id);
        for (const r of detection.repos) {
          await createRepo.mutateAsync({ projectId: proj.id, name: r.name, localPath: r.localPath, kind: r.kind, defaultBranch: r.defaultBranch });
        }
      } else if (step.key === "import") {
        if (!projectId) throw new Error("Project was not created");
        await importApply.mutateAsync({ id: projectId });
      }
      setStatuses((p) => ({ ...p, [step.key]: "done" }));
      const next = idx + 1;
      setIdx(next);
      if (next >= steps.length) onCreated();
    } catch (e: any) {
      setStatuses((p) => ({ ...p, [step.key]: "error" }));
      setErr(e?.message ?? "Step failed");
    }
  }

  return (
    <div className="modal-bg" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <h2>New project</h2>

        {phase === "path" && (
          <>
            <p className="muted" style={{ marginTop: -6 }}>
              Enter a local path. If it exists Deputy imports it; if not, it creates the folder and initializes git.
            </p>
            <div className="field">
              <label>Local path</label>
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="~/code/my-project"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && pathInput && runDetect()}
              />
            </div>
            {(suggest.data?.length ?? 0) > 0 && (
              <div className="col" style={{ gap: 4, marginTop: -8, marginBottom: 12, maxHeight: 208, overflowY: "auto" }}>
                {suggest.data!.map((s) => (
                  <div
                    key={s.path}
                    className="list-row"
                    style={{ cursor: "pointer", padding: "7px 12px", marginBottom: 0 }}
                    {...clickable(() => setPathInput(s.path + "/"))}
                  >
                    <span className="mono" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.path}</span>
                    <span className="spacer" />
                    {s.isRepo && <span className="pill st-pr_open">repo</span>}
                    {s.hasClaude && <span className="pill st-planning">.claude</span>}
                  </div>
                ))}
              </div>
            )}
            {err && <div className="submeta" style={{ color: "var(--bad)", marginBottom: 10 }}>{err}</div>}
            <div className="row">
              <span className="spacer" />
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={!pathInput || detect.isFetching} onClick={runDetect}>
                {detect.isFetching ? "Detecting…" : "Detect"}
              </button>
            </div>
          </>
        )}

        {phase === "plan" && detection && (
          <>
            <div className="list-row" style={{ marginBottom: 14 }}>
              <div className="col" style={{ gap: 3 }}>
                <b className="mono" style={{ fontSize: 13 }}>{detection.path}</b>
                <span className="submeta">{MODE_LABEL[detection.mode] ?? detection.mode}</span>
              </div>
              <span className="spacer" />
              <span className={`pill ${detection.needsScaffold ? "st-plan_review" : "st-done"}`}>
                {detection.repos.length} repo{detection.repos.length === 1 ? "" : "s"}
              </span>
            </div>

            {phase === "plan" && steps[idx]?.key === "project" && (
              <div className="field">
                <label>Project name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}

            <div className="col" style={{ gap: 8, marginBottom: 12 }}>
              {steps.map((s, i) => {
                const st = statuses[s.key] ?? (i === idx ? "pending" : i < idx ? "done" : "pending");
                const current = i === idx;
                return (
                  <div key={s.key} className="list-row" style={{ opacity: i > idx ? 0.5 : 1 }}>
                    <span className={`pill ${st === "done" ? "st-done" : st === "error" ? "st-failed" : current ? "st-plan_review" : "st-backlog"}`}>
                      {st === "done" ? "✓" : st === "error" ? "failed" : st === "running" ? "…" : i + 1}
                    </span>
                    <div className="col" style={{ gap: 2 }}>
                      <b style={{ fontWeight: 550 }}>{s.label}</b>
                      {s.detail && <span className="submeta">{s.detail}</span>}
                    </div>
                    <span className="spacer" />
                    {current && (
                      <button className="btn primary sm" disabled={busy || (s.key === "project" && !name)} onClick={confirmStep}>
                        {st === "running" ? "Working…" : "Confirm"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {err && <div className="submeta" style={{ color: "var(--bad)", marginBottom: 10 }}>{err}</div>}
            <div className="row">
              <button className="btn ghost sm" disabled={busy} onClick={() => { setDetection(null); setErr(null); }}>← Start over</button>
              <span className="spacer" />
              <button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <p className="muted" style={{ marginTop: -6 }}>Project ready. Every step completed.</p>
            <div className="row">
              <span className="spacer" />
              <button className="btn ghost" onClick={onClose}>Close</button>
              <button className="btn primary" onClick={() => projectId && nav(`/projects/${projectId}`)} disabled={!projectId}>
                Open project →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
