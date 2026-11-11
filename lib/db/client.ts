import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// neon-http needs a Neon connection string (pooled, sslmode=require) in
// DATABASE_URL. For local Postgres, swap the driver to drizzle-orm/node-postgres.

export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

export type Database = typeof db;
