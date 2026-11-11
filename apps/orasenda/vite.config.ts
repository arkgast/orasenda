import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The Tauri CLI sets TAURI_DEV_HOST for a physical iOS device or with `--host`; the device must reach the dev server over the network.
const host = process.env.TAURI_DEV_HOST;

// Tauri expects a fixed dev port (tauri.conf.json `devUrl`) and a WebKit target (macOS 15.8.2 and later, iOS 16+).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    // Safari 18 is the WebKit that macOS Sequoia 15.x ships. The 15.8.2 security notes
    // (https://support.apple.com/en-us/149523) do not name a Safari version, so this is the Sequoia
    // baseline, not a number read from that page. It is a deliberate lower bound: it can only make the
    // output more conservative, never newer than macOS 15.8.2's WebKit. To pin it exactly, read
    // Safari's version on a 15.8.2 machine (/Applications/Safari.app) and set the matching target.
    target: "safari18",
    rolldownOptions: {
      // Setting `input` replaces the default entry, so the main page is listed too.
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        overlay: resolve(import.meta.dirname, "overlay.html"),
        dev: resolve(import.meta.dirname, "dev.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
