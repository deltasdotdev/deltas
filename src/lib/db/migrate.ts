import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, schema } from "./app";
import { auth } from "../auth/auth";
import { eq } from "drizzle-orm";

export async function runMigrations() {
    console.info("Running migrations...");
    migrate(db, { migrationsFolder: "./drizzle" });
    console.info("Migrations completed.");
    console.log("--------------------------------------------------");

    console.log("Creating admin user with email:", process.env.ADMIN_EMAIL);
    try {
        const newUser = await auth.api.createUser({
            body: {
                email: process.env.ADMIN_EMAIL || "admin@deltas.email",
                password: process.env.ADMIN_PASSWORD || "StrongPassword123",
                name: "Admin",
                role: "admin",
            },
        });
        console.log("Admin user created with ID:", newUser.user.id);
    } catch (err) {
        // Better Auth throws APIError on duplicate or constraint violation
        if (err instanceof Error && /already exists|duplicate|unique/i.test(err.message)) {
            console.info("Admin user already exists; skipping creation.");
        } else {
            throw err;
        }
    }
}
