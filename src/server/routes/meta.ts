import { Hono } from "hono";
import { getAppVersion } from "../../lib/version.js";
import { isDevHome } from "../../lib/paths.js";

const app = new Hono();

app.get("/", (c) =>
  c.json({
    version: getAppVersion(),
    devMode: isDevHome(),
  })
);

export default app;
