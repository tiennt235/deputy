import { useEffect, useRef } from "react";
import superjson from "superjson";
import type { WsMessage } from "@loop/core";
import { WS_URL } from "./trpc";

/**
 * Subscribe to the live event bus. Reconnects automatically. The handler is
 * called for every WsMessage; consumers filter by channel/taskId.
 */
export function useWs(onMessage: (msg: WsMessage) => void): void {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        try {
          const msg = superjson.parse<WsMessage>(ev.data);
          handlerRef.current(msg);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);
}
