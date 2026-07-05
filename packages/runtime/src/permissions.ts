import type { PermissionPolicy } from "@loop/core";

/**
 * Match a permission rule against a tool call.
 * Rule forms:
 *   "Read"                → any use of Read
 *   "Bash(git status)"    → Bash with exact command
 *   "Bash(git diff *)"    → Bash with wildcard command
 *   "Edit(src/**)"        → Edit with a file_path glob-ish match
 */
export function matchRule(rule: string, toolName: string, input: Record<string, unknown>): boolean {
  const m = rule.match(/^([A-Za-z_]+)\((.*)\)$/);
  if (!m) return rule === toolName;
  const [, ruleTool, pattern] = m;
  if (ruleTool !== toolName) return false;

  const target =
    typeof input.command === "string"
      ? (input.command as string)
      : typeof input.file_path === "string"
        ? (input.file_path as string)
        : JSON.stringify(input);

  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*") +
      "$",
  );
  return regex.test(target);
}

export function matchAny(rules: string[], toolName: string, input: Record<string, unknown>): boolean {
  return rules.some((r) => matchRule(r, toolName, input));
}

export type PolicyDecision = "allow" | "deny" | "ask";

export function evaluatePolicy(
  policy: PermissionPolicy,
  toolName: string,
  input: Record<string, unknown>,
): PolicyDecision {
  if (matchAny(policy.deny, toolName, input)) return "deny";
  if (matchAny(policy.ask, toolName, input)) return "ask";
  if (matchAny(policy.allow, toolName, input)) return "allow";
  return "ask"; // fall through to a human decision by default
}
