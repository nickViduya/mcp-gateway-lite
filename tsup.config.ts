import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/sync/run.ts",
    "src/db/migrate.ts",
    "src/db/seed.ts",
    "src/auth/rotateKey.ts",
  ],
  format: ["esm"],
  target: "node22",
  sourcemap: true,
  clean: true,
  dts: true,
  outDir: "dist",
  splitting: false,
});
