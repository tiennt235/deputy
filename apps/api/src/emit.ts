import { prisma } from "@loop/db";
import type { AgentEvent, AgentEventType } from "@loop/core";
import { bus } from "./bus.js";

/** Persist an agent event and publish it to the task channel + global. */
export async function emitEvent(
  taskId: string,
  type: AgentEventType,
  payload: Record<string, unknown>,
  runId?: string | null,
): Promise<void> {
  const row = await prisma.agentEvent.create({
    data: { taskId, runId: runId ?? null, type, payload: payload as any },
  });
  const event: AgentEvent = {
    id: row.id,
    taskId,
    runId: runId ?? null,
    type,
    payload,
    createdAt: row.createdAt.toISOString(),
  };
  bus.publish(`task:${taskId}`, event);
}

/** Board-level status change notification (no DB row for the stream, but marks status). */
export function emitStatus(taskId: string, status: string, extra: Record<string, unknown> = {}): void {
  bus.publish(`task:${taskId}`, {
    id: `status-${Date.now()}`,
    taskId,
    type: "status",
    payload: { status, ...extra },
    createdAt: new Date().toISOString(),
  });
  bus.publish("global", {
    id: `status-${Date.now()}`,
    taskId,
    type: "status",
    payload: { status, ...extra },
    createdAt: new Date().toISOString(),
  });
}
