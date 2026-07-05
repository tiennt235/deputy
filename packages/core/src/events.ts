// Domain event shapes streamed to the UI over WebSocket.

export type AgentEventType =
  | "status" // task status changed
  | "system" // session init / metadata
  | "assistant_text"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "permission_request"
  | "permission_resolved"
  | "plan_proposed"
  | "review"
  | "result" // a run finished (with cost)
  | "error";

export interface AgentEvent {
  id: string;
  taskId: string;
  runId?: string | null;
  type: AgentEventType;
  payload: Record<string, unknown>;
  createdAt: string; // ISO
}

// WebSocket message envelope (server → client).
export interface WsMessage {
  channel: string; // "task:<id>" | "global"
  event: AgentEvent;
}
