import { afterEach, describe, expect, it, vi } from "vitest";

async function loadServer(): Promise<{ host?: unknown; hmr?: unknown; port?: number }> {
  vi.resetModules();
  const mod = await import("../vite.config");
  const config = mod.default as { server?: { host?: unknown; hmr?: unknown; port?: number } };
  return config.server ?? {};
}

describe("vite dev server", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps localhost and the default HMR socket when TAURI_DEV_HOST is unset", async () => {
    vi.stubEnv("TAURI_DEV_HOST", "");
    const server = await loadServer();
    expect(server.port).toBe(1420);
    expect(server.host).toBe(false);
    expect(server.hmr).toBeUndefined();
  });

  it("binds to TAURI_DEV_HOST and points HMR at it on port 1421", async () => {
    vi.stubEnv("TAURI_DEV_HOST", "192.168.1.20");
    const server = await loadServer();
    expect(server.host).toBe("192.168.1.20");
    expect(server.hmr).toEqual({ protocol: "ws", host: "192.168.1.20", port: 1421 });
  });
});
