import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

export const app_db = new Database(process.env.APP_DB_FILE_NAME!);
export const db = drizzle({ client: app_db });
export * as schema from "./schema/schema";