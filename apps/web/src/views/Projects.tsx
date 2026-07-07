import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { ago, Empty, clickable } from "../ui";
import { NewProjectWizard } from "./NewProjectWizard";

export function Projects() {
  const nav = useNavigate();
  const projects = trpc.projects.list.useQuery();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="topbar">
        <h1>Projects</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setOpen(true)}>
          + New project
        </button>
      </div>
      <div className="content">
        {(projects.data?.length ?? 0) === 0 ? (
          <Empty>No projects yet. Create one to register repos and start delegating tasks.</Empty>
        ) : (
          <div className="col">
            {projects.data!.map((p) => (
              <div className="list-row" key={p.id} style={{ cursor: "pointer" }} {...clickable(() => nav(`/projects/${p.id}`))}>
                <div className="col" style={{ gap: 3 }}>
                  <b>{p.name}</b>
                  <span className="submeta">
                    {p.repos.length} repo{p.repos.length === 1 ? "" : "s"} · {p._count.tasks} tasks · {ago(p.createdAt)}
                  </span>
                </div>
                <span className="spacer" />
                <span className="muted">Open →</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && <NewProjectWizard onClose={() => setOpen(false)} onCreated={() => projects.refetch()} />}
    </>
  );
}
