import { defineConfig } from "@playwright/test";

// One fixed port: `just specimens` serves the same page for a person.
const PORT = 4179;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL, browserName: "webkit", trace: "on-first-retry" },
  projects: [
    { name: "light", use: { colorScheme: "light" } },
    { name: "dark", use: { colorScheme: "dark" } },
    { name: "light-reduced-motion", use: { colorScheme: "light", reducedMotion: "reduce" } },
  ],
  webServer: {
    command: `pnpm --filter @orasenda/ui specimens --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
