// Task lifecycle state machine.
// backlog → planning → plan_review → executing → checking →
//   ├─ changes_requested → executing (loop)
//   └─ human_review → pr_open → done
// Terminal: done | failed | cancelled

export type TaskStatus =
  | "backlog"
  | "planning"
  | "plan_review"
  | "executing"
  | "checking"
  | "changes_requested"
  | "human_review"
  | "pr_open"
  | "done"
  | "failed"
  | "cancelled";

export const TASK_STAGES: TaskStatus[] = [
  "backlog",
  "planning",
  "plan_review",
  "executing",
  "checking",
  "changes_requested",
  "human_review",
  "pr_open",
  "done",
];

// Stages where the platform is waiting on a human decision (the "attention queue").
export const HUMAN_GATE_STAGES: TaskStatus[] = ["plan_review", "human_review"];

// Stages where an agent is actively running.
export const ACTIVE_STAGES: TaskStatus[] = ["planning", "executing", "checking"];

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ["planning", "cancelled"],
  planning: ["plan_review", "failed", "cancelled"],
  plan_review: ["executing", "planning", "cancelled"], // approve / re-plan / reject
  executing: ["checking", "failed", "cancelled"],
  checking: ["human_review", "changes_requested", "failed", "cancelled"],
  changes_requested: ["executing", "cancelled"],
  human_review: ["pr_open", "changes_requested", "done", "cancelled"],
  pr_open: ["done", "cancelled"],
  done: [],
  failed: ["backlog"], // allow retry
  cancelled: ["backlog"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task transition: ${from} → ${to}`);
  }
}

export function isHumanGate(status: TaskStatus): boolean {
  return HUMAN_GATE_STAGES.includes(status);
}

export function isActive(status: TaskStatus): boolean {
  return ACTIVE_STAGES.includes(status);
}
