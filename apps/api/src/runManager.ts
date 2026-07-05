import type { RunHandle } from "@loop/runtime";

interface PendingPermission {
  resolve: (r: { allow: boolean; reason?: string }) => void;
}

/**
 * Tracks live agent runs so the UI can inject guidance, interrupt, and answer
 * permission prompts against an in-flight session.
 */
class RunManager {
  private runs = new Map<string, RunHandle>(); // taskId → handle
  private pending = new Map<string, PendingPermission>(); // permissionRequestId → resolver

  setRun(taskId: string, handle: RunHandle): void {
    this.runs.set(taskId, handle);
  }

  getRun(taskId: string): RunHandle | undefined {
    return this.runs.get(taskId);
  }

  clearRun(taskId: string): void {
    this.runs.delete(taskId);
  }

  /** Register a permission request that blocks the agent until resolved. */
  awaitPermission(requestId: string): Promise<{ allow: boolean; reason?: string }> {
    return new Promise((resolve) => {
      this.pending.set(requestId, { resolve });
    });
  }

  resolvePermission(requestId: string, allow: boolean, reason?: string): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    this.pending.delete(requestId);
    p.resolve({ allow, reason });
    return true;
  }
}

export const runManager = new RunManager();
