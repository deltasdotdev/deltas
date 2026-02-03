import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from 'drizzle-orm/libsql';
import { admin,organization } from "better-auth/plugins"
import { createClient } from '@libsql/client';
const client = createClient({ url: 'file:gen.db' });
const db = drizzle({ client });

export const auth = betterAuth({
   database: drizzleAdapter(db, {
        provider: "sqlite", // or "mysql", ""
    }),
    emailAndPassword: {
        enabled: true,
    },
    plugins: [
        admin(),organization() 
    ]
});
