import { useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { useWs } from "../ws";
import { StatusPill, STATUS_LABELS, ago, money, Empty } from "../ui";

const COLUMNS: string[] = [
  "backlog",
  "planning",
  "plan_review",
  "executing",
  "checking",
  "changes_requested",
  "human_review",
  "done",
];

export function Board() {
  const nav = useNavigate();
  const board = trpc.tasks.board.useQuery(undefined, { refetchInterval: 4000 });
  useWs((msg) => {
    if (msg.event.type === "status") board.refetch();
  });

  const tasks = board.data ?? [];
  const byStatus = (s: string) => tasks.filter((t) => t.status === s);

  return (
    <>
      <div className="topbar">
        <h1>Task board</h1>
        <div className="spacer" />
        <span className="faint">{tasks.length} tasks</span>
      </div>
      <div className="content" style={{ maxWidth: "none" }}>
        {tasks.length === 0 ? (
          <Empty>
            No tasks yet. Create a project and add a task to start a loop.
          </Empty>
        ) : (
          <div className="board">
            {COLUMNS.map((col) => {
              const items = byStatus(col);
              return (
                <div className="board-col" key={col}>
                  <h3>
                    <StatusPill status={col} />
                    <span className="count">{items.length}</span>
                  </h3>
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className={`task-card ${["plan_review", "human_review"].includes(t.status) ? "attn-strip" : ""}`}
                      onClick={() => nav(`/tasks/${t.id}`)}
                    >
                      <div className="title">{t.title}</div>
                      <div className="meta">
                        <span>{t.project?.name}</span>
                        <span>·</span>
                        <span>{money(t.costUsd)}</span>
                        <span>·</span>
                        <span>{ago(t.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
