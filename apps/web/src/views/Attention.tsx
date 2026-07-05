import { useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { useWs } from "../ws";
import { StatusPill, ago, Empty } from "../ui";

export function Attention() {
  const nav = useNavigate();
  const q = trpc.tasks.attention.useQuery(undefined, { refetchInterval: 4000 });
  useWs((msg) => {
    if (["status", "permission_request", "permission_resolved", "plan_proposed", "review"].includes(msg.event.type))
      q.refetch();
  });

  const gates = q.data?.gates ?? [];
  const perms = q.data?.permissions ?? [];
  const nothing = gates.length === 0 && perms.length === 0;

  return (
    <>
      <div className="topbar">
        <h1>Attention</h1>
        <div className="spacer" />
        <span className="faint">what needs you — nothing else does</span>
      </div>
      <div className="content">
        {nothing && (
          <Empty>
            ✓ All clear. Agents are working autonomously — you'll be pinged here only when a
            plan or diff needs approval, or an agent asks permission.
          </Empty>
        )}

        {perms.length > 0 && (
          <div className="col" style={{ marginBottom: 24 }}>
            <h2>Permission requests</h2>
            {perms.map((p) => (
              <div className="perm" key={p.id}>
                <div className="row">
                  <b>{p.task?.title}</b>
                  <span className="spacer" />
                  <button className="btn sm" onClick={() => nav(`/tasks/${p.taskId}`)}>
                    Review →
                  </button>
                </div>
                <div className="mono muted" style={{ marginTop: 6 }}>
                  wants to use <b>{p.toolName}</b>
                </div>
              </div>
            ))}
          </div>
        )}

        {gates.length > 0 && (
          <div className="col">
            <h2>Human gates</h2>
            {gates.map((t) => (
              <div className="list-row" key={t.id} onClick={() => nav(`/tasks/${t.id}`)} style={{ cursor: "pointer" }}>
                <StatusPill status={t.status} />
                <div className="col" style={{ gap: 2 }}>
                  <b>{t.title}</b>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {t.project?.name} · {ago(t.updatedAt)}
                  </span>
                </div>
                <span className="spacer" />
                <span className="muted">
                  {t.status === "plan_review" ? "Approve the plan →" : "Review the diff →"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
