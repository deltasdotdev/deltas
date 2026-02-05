import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, schema } from "./app";


export async function runMigrations() {
    console.info("Running migrations...");
    migrate(db, { migrationsFolder: "./drizzle" });
    console.info("Migrations completed.");
    console.log("--------------------------------------------------");
}
