import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";

// Serves the specimens for the layout harness (verification/layout) and for a person: `just specimens`.
const config: UserConfig = defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": `${import.meta.dirname}/../src` } },
  clearScreen: false,
});
export default config;
