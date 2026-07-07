import React from "react";

export const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  planning: "Planning",
  plan_review: "Plan review",
  executing: "Executing",
  checking: "Checking",
  changes_requested: "Changes requested",
  human_review: "Human review",
  pr_open: "PR open",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`pill st-${status}`}>
      <span className="dot" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function money(n: number): string {
  return `$${(n ?? 0).toFixed(n < 1 ? 4 : 2)}`;
}

export function ago(d: string | Date): string {
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.floor((Date.now() - t.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Simple diff patch renderer with line coloring. */
export function DiffView({ patch }: { patch: string }) {
  const lines = patch.split("\n");
  return (
    <pre className="diff-body">
      {lines.map((ln, i) => {
        let cls = "";
        if (ln.startsWith("+") && !ln.startsWith("+++")) cls = "ln-add";
        else if (ln.startsWith("-") && !ln.startsWith("---")) cls = "ln-del";
        else if (ln.startsWith("@@")) cls = "ln-hunk";
        return (
          <div key={i} className={cls}>
            {ln || " "}
          </div>
        );
      })}
    </pre>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Skeleton placeholder for content that is still loading (preferred over a spinner). */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="skeleton-page" role="status" aria-busy="true" aria-label={label}>
      <span className="skeleton" style={{ height: 20, width: "34%" }} />
      <span className="skeleton" style={{ height: 64, width: "100%" }} />
      <span className="skeleton" style={{ height: 64, width: "100%" }} />
      <span className="skeleton" style={{ height: 64, width: "68%" }} />
    </div>
  );
}

/**
 * Props that make a non-button element (a clickable div/span) keyboard-operable:
 * focusable, activatable with Enter/Space, and announced as a button.
 */
export function clickable(onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      // Ignore keys bubbling up from inner controls (e.g. a row's own button).
      if (e.currentTarget !== e.target) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
