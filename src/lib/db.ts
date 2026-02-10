import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

export const app_db = new Database(process.env.APP_DB_FILE_NAME || "deltas.sqlite");
export const db = drizzle({ client: app_db });
export * as schema from "./db/schema";

export async function runMigrations() {
    console.info("Running migrations...");
    migrate(db, { migrationsFolder: "./drizzle" });
    console.info("Migrations completed.");
    console.log("--------------------------------------------------");
}