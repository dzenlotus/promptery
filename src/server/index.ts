import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import spacesRoute from "./routes/spaces.js";
import boardsRoute from "./routes/boards.js";
import { boardColumnsRoute, columnsRoute } from "./routes/columns.js";
import { boardTasksRoute, tasksRoute } from "./routes/tasks.js";
import promptsRoute from "./routes/prompts.js";
import skillsRoute from "./routes/skills.js";
import mcpToolsRoute from "./routes/mcpTools.js";
import rolesRoute from "./routes/roles.js";
import bridgesRoute from "./routes/bridges.js";
import settingsRoute from "./routes/settings.js";
import promptGroupsRoute from "./routes/promptGroups.js";
import tagsRoute from "./routes/tags.js";
import { reportsRoute, taskReportsRoute } from "./routes/agentReports.js";
import metaRoute from "./routes/meta.js";
import { createDataRouter } from "./routes/data.js";
import maintenanceRoute from "./routes/maintenance.js";
import { errorHandler } from "./middleware/error.js";
import { handleWsClose, handleWsOpen } from "./events/websocket.js";
import { findFreePort } from "../lib/port.js";
import { getAppVersion } from "../lib/version.js";
import { mountUiStatic } from "./static.js";

export function createApp() {
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.use("*", logger());
  app.use("/api/*", cors({ origin: "*" }));

  app.route("/api/spaces", spacesRoute);
  app.route("/api/boards", boardsRoute);
  app.route("/api/boards", boardColumnsRoute);
  app.route("/api/boards", boardTasksRoute);
  app.route("/api/columns", columnsRoute);
  app.route("/api/tasks", tasksRoute);
  app.route("/api/tasks", taskReportsRoute);
  app.route("/api/reports", reportsRoute);
  app.route("/api/prompts", promptsRoute);
  app.route("/api/skills", skillsRoute);
  app.route("/api/mcp_tools", mcpToolsRoute);
  app.route("/api/roles", rolesRoute);
  app.route("/api/bridges", bridgesRoute);
  app.route("/api/settings", settingsRoute);
  app.route("/api/prompt-groups", promptGroupsRoute);
  app.route("/api/tags", tagsRoute);
  app.route("/api/meta", metaRoute);
  app.route("/api/data", createDataRouter(getAppVersion()));
  app.route("/api/maintenance", maintenanceRoute);

  app.get(
    "/ws",
    upgradeWebSocket(() => ({
      onOpen: (_evt, ws) => handleWsOpen(ws),
      onClose: (_evt, ws) => handleWsClose(ws),
      onError: (_evt, ws) => handleWsClose(ws),
    }))
  );

  app.get("/health", (c) => c.json({ ok: true }));

  // UI static comes last so API routes always win; mountUiStatic is a no-op when dist/ui is missing.
  const uiMounted = mountUiStatic(app);

  app.onError(errorHandler);

  return { app, injectWebSocket, uiMounted };
}

export interface ServerHandle {
  port: number;
  server: ServerType;
  uiMounted: boolean;
  close: () => Promise<void>;
}

export async function startServer(
  preferredPort: number,
  portRangeEnd: number = preferredPort + 100
): Promise<ServerHandle> {
  const { app, injectWebSocket, uiMounted } = createApp();
  const port = await findFreePort(preferredPort, portRangeEnd);

  return new Promise<ServerHandle>((resolve, reject) => {
    // findFreePort probes 127.0.0.1, but hono's serve binds on the default
    // address — they can disagree (e.g. a sibling hub on ::/0.0.0.0 keeps
    // the port taken for the actual listen). Without an error listener the
    // underlying net.Server crashes the process with an unhandled 'error'
    // event, which hides the real cause behind a stack trace.
    const server = serve({ fetch: app.fetch, port }, (info) => {
      injectWebSocket(server);
      resolve({
        port: info.port,
        server,
        uiMounted,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
    server.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use. Stop the other process or pick a different port.`
          )
        );
        return;
      }
      reject(err);
    });
  });
}
