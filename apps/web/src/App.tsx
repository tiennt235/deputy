import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { trpc } from "./trpc";
import { Attention } from "./views/Attention";
import { Board } from "./views/Board";
import { Projects } from "./views/Projects";
import { ProjectDetail } from "./views/ProjectDetail";
import { TaskDetail } from "./views/TaskDetail";
import { Help } from "./views/Help";

function Sidebar() {
  const attention = trpc.tasks.attention.useQuery(undefined, { refetchInterval: 5000 });
  const pending =
    (attention.data?.gates.length ?? 0) + (attention.data?.permissions.length ?? 0);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">D</div>
        <div>
          <b>Deputy</b>
          <small>agent crew</small>
        </div>
      </div>
      <div className="nav-section">Workspace</div>
      <NavLink to="/attention" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        Attention
        {pending > 0 && <span className="badge warn">{pending}</span>}
      </NavLink>
      <NavLink to="/board" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        Task board
      </NavLink>
      <NavLink to="/projects" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        Projects
      </NavLink>
      <div className="spacer" />
      <NavLink to="/help" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
        Help
      </NavLink>
      <div className="faint" style={{ fontSize: 11, padding: "8px" }}>
        Claude Code runtime · single-user local
      </div>
    </aside>
  );
}

export function App() {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/attention" replace />} />
          <Route path="/attention" element={<Attention />} />
          <Route path="/board" element={<Board />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </div>
    </div>
  );
}
