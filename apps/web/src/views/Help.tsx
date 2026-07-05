import { StatusPill } from "../ui";

export function Help() {
  return (
    <>
      <div className="topbar">
        <h1>Help</h1>
        <div className="spacer" />
        <span className="faint">onboarding &amp; how the loop works</span>
      </div>
      <div className="content doc">
        <h2>Start the platform</h2>
        <p className="sub">One command brings up the database and the dashboard on a single port.</p>
        <div className="codeblock">
          <div><span className="pr">$</span> deputy up <span className="cm"># builds the UI first run, starts DB + server</span></div>
          <div className="cm"># → open http://localhost:4000</div>
        </div>
        <p>Daily commands: <code className="inline">deputy status</code> · <code className="inline">deputy logs</code> · <code className="inline">deputy restart</code> · <code className="inline">deputy down</code>. All state lives in <code className="inline">~/.deputy</code> (database, cloned repos, and per-task worktrees).</p>

        <h2>Add an existing project</h2>
        <p className="sub">Point the platform at a repo you already have. Your working copy is never touched — work happens in isolated worktrees.</p>
        <div className="card">
          <div className="hstep"><div className="hnum">1</div><div><div className="ht">Create the project <span className="where">Projects → New project</span></div><div className="hd">Name it and add a one-line description. A default harness is created automatically.</div></div></div>
          <div className="hstep"><div className="hnum">2</div><div><div className="ht">Register the repo <span className="where">Project → Repos</span></div><div className="hd">Set <b>Local path</b> to the repo's absolute path. Add a <b>Git URL</b> to enable push + PR. Pick <b>mono</b> or <b>poly_member</b> and the real default branch. Add several repos for a multi-repo project.</div></div></div>
          <div className="hstep"><div className="hnum">3</div><div><div className="ht">Seed project memory <span className="where">Project → Memory</span></div><div className="hd">Paste conventions, architecture notes, and constraints that aren't obvious from the code. This is injected into every run.</div></div></div>
          <div className="hstep"><div className="hnum">4</div><div><div className="ht">Tune the harness <span className="where">Project → Harness</span></div><div className="hd">Set the model, auto-approved tools, permission policy, and project-wide conventions in the system-prompt append.</div></div></div>
          <div className="hstep"><div className="hnum">5</div><div><div className="ht">Capture build/test know-how as skills <span className="where">Project → Skills</span></div><div className="hd">Write a <b>SKILL.md</b> for how to install / build / test / lint this repo — synced into every worktree. Existing <code className="inline">.claude/skills/</code> in your repo load too.</div></div></div>
          <div className="hstep"><div className="hnum">6</div><div><div className="ht">Delegate the first task <span className="where">Project → Tasks → Start loop</span></div><div className="hd">Describe an <b>outcome</b> (what &amp; why, not step-by-step), pick the repos, and start. Approve the plan and the diff at the two gates in the Attention queue.</div></div></div>
        </div>

        <h2>Start a brand-new project</h2>
        <p className="sub">No repo yet? Create an empty one first so worktrees have a base commit, then register its path in step 2 above.</p>
        <div className="codeblock">
          <div><span className="pr">$</span> mkdir -p ~/code/mynewthing &amp;&amp; cd ~/code/mynewthing</div>
          <div><span className="pr">$</span> git init &amp;&amp; git commit --allow-empty -m "init"</div>
        </div>

        <h2>How a task flows</h2>
        <p className="sub">Two steps are yours (the gates); everything between runs itself.</p>
        <div className="card">
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <StatusPill status="planning" /><span className="faint">→</span>
            <StatusPill status="plan_review" /><span className="faint">→</span>
            <StatusPill status="executing" /><span className="faint">→</span>
            <StatusPill status="checking" /><span className="faint">→</span>
            <StatusPill status="human_review" /><span className="faint">→</span>
            <StatusPill status="pr_open" /><span className="faint">→</span>
            <StatusPill status="done" />
          </div>
          <div className="hd muted" style={{ marginTop: 12, fontSize: 13 }}>
            A read-only planner drafts a plan → <b>you approve it</b> → the maker implements in a worktree
            (tool calls outside the auto-approved set pause in the permission inbox) → an evidence agent
            actually runs the change and a fresh-context checker reviews the diff → <b>you approve the diff</b>
            → commit, and open a PR for repos with a remote. A failed evidence check or checker verdict loops
            back to the maker; a failed run auto-rolls back the worktree.
          </div>
        </div>

        <h2>Good to know</h2>
        <div className="callout">
          <div className="ct">Before you start a task</div>
          <ul>
            <li><b>Your working copy is never touched.</b> Each task runs in an isolated worktree under <code className="inline">~/.deputy/worktrees</code>, on a <code className="inline">deputy/&lt;task&gt;</code> branch.</li>
            <li><b>Commit or stash local changes first</b> — worktrees branch off your default branch's HEAD.</li>
          </ul>
        </div>
        <div className="callout">
          <div className="ct">Current rough edges</div>
          <ul>
            <li><b>Dependencies reinstall per task</b> — a fresh worktree is created each time, so <code className="inline">node_modules</code>/build cache don't carry over yet.</li>
            <li><b>A gitignored <code className="inline">.env</code> isn't copied into the worktree</b> — if the build/tests need secrets, add them manually for now.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
