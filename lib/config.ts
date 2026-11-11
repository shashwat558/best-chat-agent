import { parseConfig } from "./config-schema";

export type { AppConfig } from "./config-schema";

export const config = parseConfig(process.env);
