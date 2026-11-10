import { configDefaults, defineConfig, type ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = defineConfig({
  resolve: { alias: { "@": `${import.meta.dirname}/src` } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    // The artifact build is slow: `just design-system-check` builds once and runs it (DS_OUT set).
    exclude: process.env.DS_OUT
      ? configDefaults.exclude
      : [...configDefaults.exclude, "designSystem.test.ts"],
  },
});
export default config;
