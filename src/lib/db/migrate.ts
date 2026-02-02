import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, schema } from "./app";
import { auth } from "../auth/auth";
import { eq } from "drizzle-orm";

export async function runMigrations() {
    console.info("Running migrations...");
    migrate(db, { migrationsFolder: "./drizzle" });
    console.info("Migrations completed.");
    console.log("--------------------------------------------------");
    const adminExists = await db.select().from(schema.user).where(
        eq(schema.user.role, "admin")
    ).limit(1);
    console.log("Admin exists:", adminExists.length > 0);
    if (!adminExists.length) {
        console.log("Creating admin user with email:", process.env.ADMIN_EMAIL);
        const newUser = await auth.api.createUser({
            body: {
                email: process.env.ADMIN_EMAIL || "admin@deltas.email",
                password: process.env.ADMIN_PASSWORD || "StrongPassword123",
                name: "Admin",
                role: "admin",
            },
        });
        if (!process.env.ADMIN_EMAIL && !process.env.ADMIN_PASSWORD) {
            console.warn("Warning: ADMIN_EMAIL or ADMIN_PASSWORD environment variables are not set. Using default credentials.");
            console.error("It's highly recommended to set these environment variables for security reasons.");
        }
        console.log("Admin user created with ID:", newUser.user.id);
        console.log("--------------------------------------------------");
    }
}
