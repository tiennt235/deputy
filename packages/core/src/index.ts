export * from "./stateMachine.js";
export * from "./events.js";

export interface PermissionPolicy {
  allow: string[];
  ask: string[];
  deny: string[];
  defaultMode: "default" | "acceptEdits" | "plan" | "bypassPermissions" | "dontAsk";
}

export const DEFAULT_PERMISSION_POLICY: PermissionPolicy = {
  allow: ["Read", "Grep", "Glob", "Bash(git status)", "Bash(git diff *)", "Bash(ls *)"],
  ask: [],
  deny: ["Bash(rm -rf /*)", "Bash(sudo *)"],
  defaultMode: "default",
};
