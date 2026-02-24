import "dotenv/config";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { logger } from "../common/logger.js";

import { closeDatabaseConnection, database } from "./client.js";

const runMigrations = async (): Promise<void> => {
  logger.info("Running database migrations");

  await migrate(database, {
    migrationsFolder: "./drizzle/migrations",
  });

  logger.info("Database migrations completed");
};

runMigrations()
  .catch((error: unknown) => {
    logger.error({ error }, "Database migration failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
