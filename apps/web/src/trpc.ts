import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@loop/api/router";

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

// Dev: web is served by Vite (:5173) while the API runs on :4000.
// App mode: the API serves the built web from the same origin, so use it directly.
const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
export const API_URL = import.meta.env.DEV ? `http://${location.hostname}:4000` : location.origin;
export const WS_URL = import.meta.env.DEV
  ? `ws://${location.hostname}:4000/ws`
  : `${wsProto}//${location.host}/ws`;
