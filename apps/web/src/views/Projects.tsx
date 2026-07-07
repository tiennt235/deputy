import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { ago, Empty, clickable } from "../ui";

export function Projects() {
  const nav = useNavigate();
  const projects = trpc.projects.list.useQuery();
  const create = trpc.projects.create.useMutation({ onSuccess: () => projects.refetch() });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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

      {open && (
        <div
          className="modal-bg"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          role="presentation"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New project</h2>
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments service" autoFocus />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project?" />
            </div>
            <div className="row">
              <span className="spacer" />
              <button className="btn ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!name || create.isPending}
                onClick={async () => {
                  const p = await create.mutateAsync({ name, description });
                  setOpen(false);
                  setName("");
                  setDescription("");
                  nav(`/projects/${p.id}`);
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
