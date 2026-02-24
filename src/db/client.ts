import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { config } from "../config.js";

import * as schema from "./schema.js";

const sqlClient = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const database = drizzle(sqlClient, { schema });

export const closeDatabaseConnection = async (): Promise<void> => {
  await sqlClient.end();
};
