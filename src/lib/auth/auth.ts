import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "../../../auth-schema";
import { admin,organization } from "better-auth/plugins"
import { db } from "../db/app";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: schema,

  }),
  emailAndPassword: {
        enabled: true,
    },
    plugins: [
       admin(),organization() 
    ]
});
