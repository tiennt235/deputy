import { EventEmitter } from "node:events";
import type { AgentEvent, WsMessage } from "@loop/core";

/**
 * In-process pub/sub bridging orchestrator events to WebSocket clients.
 * Channels: "task:<id>" for per-task streams, "global" for board-level updates.
 */
class Bus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(1000);
  }

  publish(channel: string, event: AgentEvent): void {
    const msg: WsMessage = { channel, event };
    this.emitter.emit(channel, msg);
    this.emitter.emit("*", msg);
  }

  subscribe(channel: string, handler: (msg: WsMessage) => void): () => void {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  subscribeAll(handler: (msg: WsMessage) => void): () => void {
    this.emitter.on("*", handler);
    return () => this.emitter.off("*", handler);
  }
}

export const bus = new Bus();
