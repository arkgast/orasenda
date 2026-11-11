import { defineConfig } from "@playwright/test";

// One fixed port: `just specimens` serves the same page for a person.
const PORT = 4179;
const baseURL = `http://localhost:${PORT}`;
// The app's own dev server, for layout.html (the real App against mockIPC, no Tauri).
const APP_PORT = 4180;
const appURL = `http://localhost:${APP_PORT}`;

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
  webServer: [
    {
      command: `pnpm --filter @orasenda/ui specimens --port ${PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm --filter orasenda exec vite --port ${APP_PORT} --strictPort`,
      url: `${appURL}/layout.html`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
