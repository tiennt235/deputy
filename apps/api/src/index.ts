import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import superjson from "superjson";
import { appRouter } from "./router.js";
import { bus } from "./bus.js";
import { config } from "./config.js";
import { startScheduler } from "./scheduler.js";

async function main() {
  const app = Fastify({ logger: false, routerOptions: { maxParamLength: 5000 } });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter },
  });

  // Live event stream — forwards all bus messages; client filters by channel.
  app.register(async (f) => {
    f.get("/ws", { websocket: true }, (socket) => {
      const send = (msg: unknown) => {
        try {
          socket.send(superjson.stringify(msg));
        } catch {
          /* socket closed */
        }
      };
      const unsub = bus.subscribeAll(send);
      socket.on("close", unsub);
      socket.on("error", unsub);
    });
  });

  app.get("/health", async () => ({ ok: true }));

  // App mode: serve the built web SPA from the same origin (single port).
  const servingWeb = existsSync(path.join(config.webDist, "index.html"));
  if (servingWeb) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: "/" });
    // SPA fallback: any non-API GET returns index.html for client-side routing.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/trpc") && !req.url.startsWith("/ws")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not found" });
    });
  }

  await app.listen({ port: config.apiPort, host: "0.0.0.0" });
  console.log(`[deputy] listening on http://localhost:${config.apiPort}`);
  console.log(servingWeb ? `[deputy] dashboard served at /` : `[deputy] API only (no built web found — run in dev with the Vite server)`);
  console.log(`[deputy] state dir: ${config.deputyHome}`);
  startScheduler();
}

main().catch((err) => {
  console.error("[loop-api] fatal:", err);
  process.exit(1);
});
