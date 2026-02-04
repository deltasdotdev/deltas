import { Elysia } from "elysia";
import { runMigrations } from "./lib/db/migrate";
import { initAuth } from "./lib/auth/init";
import { test } from "./lib/mailer/test";

await runMigrations();
await initAuth();
// await test();

const app = new Elysia().get("/", () => "Hello Elysia").listen(3000);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);
