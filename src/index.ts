import { Elysia } from "elysia";
import { runMigrations } from "./lib/db/migrate";

await runMigrations();

const app = new Elysia().get("/", () => "Hello Elysia").listen(3000);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);
