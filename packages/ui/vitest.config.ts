import { defineConfig, type ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = defineConfig({
  resolve: { alias: { "@": `${import.meta.dirname}/src` } },
  test: { environment: "jsdom", setupFiles: ["./test-setup.ts"] },
});
export default config;
