import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "../config";
import * as schema from "./schema";

export const db = drizzle(neon(config.DATABASE_URL), { schema });

export type Database = typeof db;
