import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Serves the specimens for the layout harness (verification/layout) and for a person: `just specimens`.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  clearScreen: false,
});
