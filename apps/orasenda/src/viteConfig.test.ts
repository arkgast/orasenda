import { afterEach, describe, expect, it, vi } from "vitest";

async function loadServer() {
  vi.resetModules();
  return (await import("../vite.config")).default.server ?? {};
}

describe("vite dev server", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps localhost and the default HMR socket when TAURI_DEV_HOST is unset", async () => {
    vi.stubEnv("TAURI_DEV_HOST", undefined);
    const server = await loadServer();
    expect(server.port).toBe(1420);
    expect(server.host).toBe(false);
    expect(server.hmr).toBeUndefined();
  });

  it("keeps localhost and the default HMR socket when TAURI_DEV_HOST is empty", async () => {
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

describe("vite build inputs", () => {
  it("builds one page per window, the Focus window and the floater included", async () => {
    vi.resetModules();
    const config = (await import("../vite.config")).default;
    const input = config.build?.rolldownOptions?.input as Record<string, string>;
    expect(Object.keys(input).sort()).toEqual(["dev", "floater", "focus", "main", "overlay"]);
    for (const [name, page] of Object.entries(input)) {
      expect(page.endsWith(name === "main" ? "index.html" : `${name}.html`), name).toBe(true);
    }
  });
});
