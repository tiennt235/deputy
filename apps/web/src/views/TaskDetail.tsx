import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { useWs } from "../ws";
import { StatusPill, money, DiffView, Loading, clickable } from "../ui";

interface Ev {
  id: string;
  type: string;
  payload: any;
  createdAt: string;
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const task = trpc.tasks.get.useQuery({ id: id! }, { refetchInterval: 4000 });
  const initialEvents = trpc.tasks.events.useQuery({ taskId: id! });
  const [events, setEvents] = useState<Ev[]>([]);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialEvents.data) {
      setEvents(initialEvents.data.map((e) => ({ id: e.id, type: e.type, payload: e.payload as any, createdAt: e.createdAt.toString() })));
    }
  }, [initialEvents.data]);

  useWs((msg) => {
    if (msg.event.taskId !== id) return;
    if (msg.event.type === "status") {
      task.refetch();
      return;
    }
    setEvents((prev) => [...prev, msg.event as any]);
    if (["permission_request", "permission_resolved", "plan_proposed", "review", "result"].includes(msg.event.type)) {
      task.refetch();
    }
  });

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [events.length]);

  if (!task.data) return <div className="content"><Loading label="Loading task…" /></div>;
  const t = task.data;
  const active = ["planning", "executing", "checking"].includes(t.status);

  return (
    <>
      <div className="topbar">
        <span className="faint" style={{ cursor: "pointer" }} {...clickable(() => nav(`/projects/${t.projectId}`))}>
          {t.project.name} /
        </span>
        <h1>{t.title}</h1>
        <StatusPill status={t.status} />
        {active && <span className="spin" />}
        <div className="spacer" />
        <span className="faint">{money(t.costUsd)}</span>
        {active && <InterruptButton id={t.id} />}
      </div>

      <div className="content" style={{ maxWidth: "none" }}>
        <div className="detail">
          <div className="col">
            <Gates task={t} refetch={task.refetch} />
            <Permissions task={t} refetch={task.refetch} />
            <div className="card pad-0">
              <div className="stream" ref={streamRef} style={{ padding: 14 }}>
                {events.length === 0 && <div className="faint">No activity yet. Start the loop to watch the agent work.</div>}
                {events.map((e) => (
                  <EventRow key={e.id} ev={e} />
                ))}
              </div>
            </div>
            {active && <GuidanceBox id={t.id} />}
          </div>

          <Sidebar task={t} />
        </div>
      </div>
    </>
  );
}

function InterruptButton({ id }: { id: string }) {
  const interrupt = trpc.tasks.interrupt.useMutation();
  return (
    <button className="btn sm bad" disabled={interrupt.isPending} onClick={() => interrupt.mutate({ id })}>
      Interrupt
    </button>
  );
}

function EventRow({ ev }: { ev: Ev }) {
  const p = ev.payload ?? {};
  let body: React.ReactNode = null;
  let head = ev.type.replace(/_/g, " ");

  switch (ev.type) {
    case "assistant_text":
      body = <div className="txt">{p.text}</div>;
      head = "assistant";
      break;
    case "thinking":
      body = <div className="txt">{p.text}</div>;
      break;
    case "tool_use":
      head = `tool · ${p.name}`;
      body = <pre>{typeof p.input === "object" ? JSON.stringify(p.input, null, 2).slice(0, 1200) : String(p.input)}</pre>;
      break;
    case "tool_result":
      head = p.is_error ? "tool result · error" : "tool result";
      body = <pre>{typeof p.content === "string" ? p.content.slice(0, 1500) : JSON.stringify(p.content)}</pre>;
      break;
    case "permission_request":
      head = "permission requested";
      body = <div className="mono">{p.toolName}</div>;
      break;
    case "permission_resolved":
      head = "permission " + (p.allow ? "allowed" : "denied");
      break;
    case "plan_proposed":
      head = "plan proposed";
      body = <div className="txt">{String(p.content).slice(0, 400)}…</div>;
      break;
    case "review":
      head = `review · ${p.kind ?? ""} ${p.verdict ?? ""}`;
      body = p.notes ? <div className="txt">{String(p.notes).slice(0, 600)}</div> : p.url ? <a href={p.url}>{p.url}</a> : null;
      break;
    case "result":
      head = "run finished";
      body = <div className="muted">${(p.total_cost_usd ?? 0).toFixed(4)} · {p.input_tokens}/{p.output_tokens} tok</div>;
      break;
    case "error":
      body = <div className="txt">{p.message}</div>;
      break;
    case "system":
      head = "session";
      body = <div className="mono faint">{p.model} · {p.cwd}</div>;
      break;
    default:
      body = <pre>{JSON.stringify(p).slice(0, 400)}</pre>;
  }

  return (
    <div className={`ev ${ev.type}`}>
      <div className="ev-head">{head}</div>
      {body}
    </div>
  );
}

function Gates({ task, refetch }: { task: any; refetch: () => void }) {
  if (task.status === "plan_review") return <PlanGate task={task} refetch={refetch} />;
  if (task.status === "human_review") return <DiffGate task={task} refetch={refetch} />;
  if (task.status === "changes_requested") return <ChangesGate task={task} refetch={refetch} />;
  return null;
}

function PlanGate({ task, refetch }: { task: any; refetch: () => void }) {
  const plan = task.plans?.[0];
  const [content, setContent] = useState(plan?.content ?? "");
  const approve = trpc.tasks.approvePlan.useMutation({ onSuccess: () => refetch() });
  const reject = trpc.tasks.rejectPlan.useMutation({ onSuccess: () => refetch() });
  const [feedback, setFeedback] = useState("");

  return (
    <div className="gate">
      <h2>Review the plan</h2>
      <p className="muted" style={{ marginTop: -6 }}>Edit if needed, then approve to let the agent implement. Nothing has been changed yet.</p>
      <textarea className="mono" style={{ minHeight: 220 }} value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn good" disabled={approve.isPending} onClick={() => approve.mutate({ id: task.id, editedContent: content !== plan?.content ? content : undefined })}>
          Approve & implement
        </button>
        <input placeholder="feedback for re-plan (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} style={{ flex: 1 }} />
        <button className="btn bad" disabled={reject.isPending} onClick={() => reject.mutate({ id: task.id, feedback })}>
          Re-plan
        </button>
      </div>
    </div>
  );
}

function DiffGate({ task, refetch }: { task: any; refetch: () => void }) {
  const diff = trpc.tasks.diff.useQuery({ id: task.id });
  const approve = trpc.tasks.approveDiff.useMutation({ onSuccess: () => refetch() });
  const changes = trpc.tasks.requestChanges.useMutation({ onSuccess: () => refetch() });
  const [feedback, setFeedback] = useState("");
  const checkerReview = task.reviews?.find((r: any) => r.kind === "checker");
  const evidenceReview = task.reviews?.find((r: any) => r.kind === "evidence");

  return (
    <div className="gate">
      <h2>Review the changes</h2>
      {evidenceReview && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <span className={`pill ${evidenceReview.verdict === "pass" ? "st-done" : "st-changes_requested"}`}>
              end-to-end evidence: {evidenceReview.verdict}
            </span>
          </div>
          {evidenceReview.notes && <pre className="mono faint" style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>{String(evidenceReview.notes).slice(0, 1500)}</pre>}
        </div>
      )}
      {checkerReview && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <span className={`pill ${checkerReview.verdict === "approved" ? "st-done" : "st-changes_requested"}`}>
              checker: {checkerReview.verdict}
            </span>
          </div>
          {checkerReview.notes && <div className="txt muted" style={{ marginTop: 8, fontSize: 13 }}>{checkerReview.notes}</div>}
        </div>
      )}
      {diff.data?.map((d: any) => (
        <div className="diff-file" key={d.worktreeId}>
          <div className="fh">
            <b>{d.repoName}</b>
            <span className="faint">{d.branch}</span>
            <span className="spacer" />
            <span className="add">+{d.totalAdditions}</span>
            <span className="del">−{d.totalDeletions}</span>
          </div>
          {d.patch ? <DiffView patch={d.patch} /> : <div className="diff-body faint">no changes</div>}
        </div>
      ))}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn good" disabled={approve.isPending} onClick={() => approve.mutate({ id: task.id })}>
          Approve → commit / PR
        </button>
        <input placeholder="request changes…" value={feedback} onChange={(e) => setFeedback(e.target.value)} style={{ flex: 1 }} />
        <button className="btn bad" disabled={!feedback || changes.isPending} onClick={() => changes.mutate({ id: task.id, feedback })}>
          Request changes
        </button>
      </div>
    </div>
  );
}

function ChangesGate({ task, refetch }: { task: any; refetch: () => void }) {
  const changes = trpc.tasks.requestChanges.useMutation({ onSuccess: () => refetch() });
  const [feedback, setFeedback] = useState("");
  const evidenceFail = task.reviews?.find((r: any) => r.kind === "evidence" && r.verdict === "fail");
  const checkerReview = task.reviews?.find((r: any) => r.kind === "checker" && r.verdict === "changes_requested");
  const trigger = evidenceFail ?? checkerReview;
  const source = evidenceFail ? "End-to-end evidence failed" : "Checker requested changes";
  return (
    <div className="gate">
      <h2>{source}</h2>
      {trigger?.notes && <pre className="mono muted" style={{ marginBottom: 10, whiteSpace: "pre-wrap", fontSize: 12 }}>{String(trigger.notes).slice(0, 1500)}</pre>}
      <div className="row">
        <input placeholder="add your own guidance, or just send the notes back" value={feedback} onChange={(e) => setFeedback(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary" disabled={changes.isPending} onClick={() => changes.mutate({ id: task.id, feedback: feedback || trigger?.notes || "Address the feedback above." })}>
          Send back to maker
        </button>
      </div>
    </div>
  );
}

function Permissions({ task, refetch }: { task: any; refetch: () => void }) {
  const resolve = trpc.tasks.resolvePermission.useMutation({ onSuccess: () => refetch() });
  const perms = task.permissions ?? [];
  if (perms.length === 0) return null;
  return (
    <div className="col">
      {perms.map((p: any) => (
        <div className="perm" key={p.id}>
          <div className="row">
            <b>Permission requested</b>
            <span className="spacer" />
            <button className="btn sm good" onClick={() => resolve.mutate({ requestId: p.id, allow: true })}>Allow</button>
            <button className="btn sm bad" onClick={() => resolve.mutate({ requestId: p.id, allow: false })}>Deny</button>
          </div>
          <div className="mono" style={{ marginTop: 8 }}>{p.toolName}</div>
          <pre className="mono faint" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{JSON.stringify(p.input, null, 2).slice(0, 500)}</pre>
        </div>
      ))}
    </div>
  );
}

function GuidanceBox({ id }: { id: string }) {
  const guide = trpc.tasks.guide.useMutation();
  const [text, setText] = useState("");
  return (
    <div className="row card">
      <input
        placeholder="Send guidance to the running agent…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text) {
            guide.mutate({ id, text });
            setText("");
          }
        }}
      />
      <button className="btn primary" disabled={!text} onClick={() => { guide.mutate({ id, text }); setText(""); }}>
        Send
      </button>
    </div>
  );
}

function Sidebar({ task }: { task: any }) {
  return (
    <div className="col">
      <div className="card">
        <h3>Overview</h3>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="stat"><span className="v">{money(task.costUsd)}</span><span className="k">cost</span></div>
          <div className="stat"><span className="v">{task.outputTokens}</span><span className="k">out tokens</span></div>
        </div>
        {task.description && <><hr /><div className="txt muted" style={{ fontSize: 13 }}>{task.description}</div></>}
      </div>

      {task.worktrees?.length > 0 && (
        <div className="card">
          <h3>Worktrees</h3>
          {task.worktrees.map((w: any) => (
            <div key={w.id} className="mono faint" style={{ fontSize: 12, marginBottom: 4 }}>
              {w.branch}
            </div>
          ))}
        </div>
      )}

      {task.prs?.length > 0 && (
        <div className="card">
          <h3>Pull requests</h3>
          {task.prs.map((pr: any) => (
            <a key={pr.id} href={pr.url} target="_blank" rel="noreferrer" className="row" style={{ marginBottom: 6 }}>
              <span className="pill st-done">#{pr.number ?? "?"}</span>
              <span className="mono" style={{ fontSize: 12 }}>{pr.branch}</span>
            </a>
          ))}
        </div>
      )}

      {task.runs?.length > 0 && (
        <div className="card">
          <h3>Runs</h3>
          {task.runs.map((r: any) => (
            <div key={r.id} className="row" style={{ fontSize: 12, marginBottom: 5 }}>
              <span className="pill st-backlog">{r.role}</span>
              <span className="faint">{r.status}</span>
              <span className="spacer" />
              <span className="faint">{money(r.costUsd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
