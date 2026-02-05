import { auth } from "./auth";

export async function initAuth() {
    console.log("Creating admin user with email:", process.env.ADMIN_EMAIL);
    let newUser;
    try {
        newUser = await auth.api.createUser({
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
            console.info("Admin user already exists; skipping user and organization creation.");
        } else {
            throw err;
        }
    }
    if (newUser) {
        console.log("Creating an organization:", process.env.ORG_NAME);
        try {
            await auth.api.createOrganization({
                body: {
                    name: process.env.ORG_NAME || "Deltas",
                    slug: (process.env.ORG_NAME || "deltas").toLowerCase(),
                    userId: newUser.user.id,
                    keepCurrentActiveOrganization: true,
                },
            });
            console.log("Organization created successfully.");
        } catch (err) {
            console.error("Error creating organization:", err);
        }
    }
}

