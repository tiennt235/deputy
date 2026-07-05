import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionPolicy, AgentEventType } from "@loop/core";
import { InputQueue } from "./inputQueue.js";
import { evaluatePolicy } from "./permissions.js";

export interface RuntimeEvent {
  type: AgentEventType;
  payload: Record<string, unknown>;
}

export interface PermissionAsk {
  toolName: string;
  input: Record<string, unknown>;
  toolUseId?: string;
}

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "bypassPermissions"
  | "dontAsk";

export interface StartRunInput {
  prompt: string;
  cwd: string;
  additionalDirectories?: string[];
  model?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  policy: PermissionPolicy;
  /** When true, tool calls that would "ask" are auto-approved (fully autonomous). */
  autoApprove?: boolean;
  systemPromptAppend?: string;
  settingSources?: Array<"user" | "project" | "local">;
  resume?: string;
  sessionId?: string;
  agents?: Record<string, unknown>;
  mcpServers?: Record<string, unknown>;
  maxTurns?: number;
  onEvent: (e: RuntimeEvent) => void | Promise<void>;
  onPermission: (ask: PermissionAsk) => Promise<{ allow: boolean; reason?: string }>;
}

export interface RunResult {
  sessionId?: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  resultText?: string;
  isError: boolean;
  status: "done" | "error" | "interrupted";
}

export interface RunHandle {
  sendMessage(text: string): void;
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  close(): void;
  done: Promise<RunResult>;
}

function extractContent(msg: any): any[] {
  // SDKAssistantMessage: { type:"assistant", message: Anthropic.Message }
  return msg?.message?.content ?? msg?.content ?? [];
}

/**
 * Wraps the Agent SDK query() in streaming-input mode and translates the raw
 * SDK message stream into domain RuntimeEvents. One SessionRunner drives one
 * Claude Code run (planner / maker / checker) against one worktree scope.
 */
export class SessionRunner {
  start(input: StartRunInput): RunHandle {
    const queue = new InputQueue();
    queue.push(input.prompt);

    const canUseTool = async (
      toolName: string,
      toolInput: Record<string, unknown>,
      opts: { toolUseID?: string },
    ): Promise<any> => {
      const decision = evaluatePolicy(input.policy, toolName, toolInput);
      if (decision === "deny") {
        return { behavior: "deny", message: `Denied by harness policy: ${toolName}` };
      }
      if (decision === "allow") {
        return { behavior: "allow", updatedInput: toolInput };
      }
      // "ask" → fully autonomous mode auto-approves; otherwise escalate to the human.
      if (input.autoApprove) {
        return { behavior: "allow", updatedInput: toolInput };
      }
      const res = await input.onPermission({
        toolName,
        input: toolInput,
        toolUseId: opts.toolUseID,
      });
      return res.allow
        ? { behavior: "allow", updatedInput: toolInput }
        : { behavior: "deny", message: res.reason ?? "Denied by human" };
    };

    const options: any = {
      cwd: input.cwd,
      canUseTool,
      permissionMode: input.permissionMode ?? "default",
      settingSources: input.settingSources ?? ["project"],
      includePartialMessages: false,
    };
    if (input.additionalDirectories?.length) options.additionalDirectories = input.additionalDirectories;
    if (input.model) options.model = input.model;
    if (input.allowedTools?.length) options.allowedTools = input.allowedTools;
    if (input.disallowedTools?.length) options.disallowedTools = input.disallowedTools;
    if (input.resume) options.resume = input.resume;
    if (input.sessionId) options.sessionId = input.sessionId;
    if (input.agents) options.agents = input.agents;
    if (input.mcpServers) options.mcpServers = input.mcpServers;
    if (typeof input.maxTurns === "number") options.maxTurns = input.maxTurns;
    if (input.systemPromptAppend) {
      options.systemPrompt = {
        type: "preset",
        preset: "claude_code",
        append: input.systemPromptAppend,
      };
    }

    const q = query({ prompt: queue, options });

    const result: RunResult = {
      sessionId: input.sessionId,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      isError: false,
      status: "done",
    };

    const done = (async (): Promise<RunResult> => {
      try {
        for await (const message of q as AsyncIterable<any>) {
          switch (message.type) {
            case "system": {
              if (message.session_id) result.sessionId = message.session_id;
              await input.onEvent({
                type: "system",
                payload: {
                  subtype: message.subtype,
                  session_id: message.session_id,
                  model: message.model,
                  tools: message.tools,
                  cwd: message.cwd,
                },
              });
              break;
            }
            case "assistant": {
              if (message.session_id) result.sessionId = message.session_id;
              for (const block of extractContent(message)) {
                if (block.type === "text" && block.text?.trim()) {
                  await input.onEvent({ type: "assistant_text", payload: { text: block.text } });
                } else if (block.type === "thinking" && block.thinking?.trim()) {
                  await input.onEvent({ type: "thinking", payload: { text: block.thinking } });
                } else if (block.type === "tool_use") {
                  await input.onEvent({
                    type: "tool_use",
                    payload: { id: block.id, name: block.name, input: block.input },
                  });
                }
              }
              break;
            }
            case "user": {
              for (const block of extractContent(message)) {
                if (block.type === "tool_result") {
                  const content = Array.isArray(block.content)
                    ? block.content.map((c: any) => c.text ?? "").join("\n")
                    : block.content;
                  await input.onEvent({
                    type: "tool_result",
                    payload: {
                      tool_use_id: block.tool_use_id,
                      is_error: block.is_error ?? false,
                      content: typeof content === "string" ? content.slice(0, 8000) : content,
                    },
                  });
                }
              }
              break;
            }
            case "result": {
              if (message.session_id) result.sessionId = message.session_id;
              result.costUsd = message.total_cost_usd ?? 0;
              result.inputTokens = message.usage?.input_tokens ?? 0;
              result.outputTokens = message.usage?.output_tokens ?? 0;
              result.resultText = message.result;
              result.isError = message.is_error ?? message.subtype !== "success";
              await input.onEvent({
                type: "result",
                payload: {
                  subtype: message.subtype,
                  total_cost_usd: result.costUsd,
                  input_tokens: result.inputTokens,
                  output_tokens: result.outputTokens,
                  result: message.result,
                  is_error: result.isError,
                },
              });
              // In streaming-input mode the SDK blocks awaiting more input after a
              // result. End the run unless the human queued guidance to continue.
              if (!queue.hasPending()) queue.close();
              break;
            }
            default:
              break;
          }
        }
        result.status = result.isError ? "error" : "done";
      } catch (err: any) {
        result.isError = true;
        result.status = "error";
        await input.onEvent({ type: "error", payload: { message: String(err?.message ?? err) } });
      } finally {
        queue.close();
      }
      return result;
    })();

    return {
      sendMessage: (text: string) => queue.push(text),
      interrupt: async () => {
        result.status = "interrupted";
        try {
          await (q as any).interrupt();
        } catch {
          /* interrupt only valid in streaming mode; ignore */
        }
      },
      setPermissionMode: async (mode: PermissionMode) => {
        try {
          await (q as any).setPermissionMode(mode);
        } catch {
          /* ignore */
        }
      },
      close: () => {
        try {
          (q as any).close?.();
        } catch {
          /* ignore */
        }
        queue.close();
      },
      done,
    };
  }
}
