import { defineConfig } from "@playwright/test";

// Checkpoint 1: minimal config. Checkpoint 4 adds the projects and the specimen server.
export default defineConfig({
  testDir: ".",
  retries: process.env.CI ? 1 : 0,
  use: { browserName: "webkit" },
});
