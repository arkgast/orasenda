import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The Tauri CLI sets TAURI_DEV_HOST when the app runs on a physical iOS device, which must reach the dev server over the network.
const host = process.env.TAURI_DEV_HOST;

// Tauri expects a fixed dev port (tauri.conf.json `devUrl`) and a WebKit target (macOS 13+, iOS 16+).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "safari16",
    rolldownOptions: {
      // Setting `input` replaces the default entry, so the main page is listed too.
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        overlay: resolve(import.meta.dirname, "overlay.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
