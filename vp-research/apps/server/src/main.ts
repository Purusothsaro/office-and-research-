import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { connect } from "./db";

const env = process.env;
const uri = env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const dbName = env.MONGODB_DB ?? "octogenie_research";
const port = Number(env.PORT ?? 3040);
const host = env.HOST ?? "127.0.0.1";

const db = await connect(uri, dbName);
const app = await buildApp({
  db,
  secureCookies: env.COOKIE_SECURE === "true",
  sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 14),
  authRateLimit: Number(env.AUTH_RATE_LIMIT ?? 10),
  staticDir: env.STATIC_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
  logger: env.LOG !== "false",
});

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host });
console.log(`OctoGenie Research server on http://${host}:${port} (database ${dbName})`);
