import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { mockBackend } from "./testing";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  clearMocks();
  vi.resetModules();
});

test("dev_entry_renders_panel", async () => {
  const calls = mockBackend({
    spike_status: () => ({ enabled: true, platformSupported: true }),
    spike_running_apps: () => [],
    spike_usage: () => [],
    spike_rule: () => ({ targets: [], action: "hide" }),
    spike_set_rule: () => null,
  });
  document.body.innerHTML = '<div id="root"></div>';
  await import("./devMain");
  expect(await screen.findByRole("heading", { name: "Blocking spike" })).toBeTruthy();
  expect(calls.some((call) => call.cmd === "spike_status")).toBe(true);
});

test("dev entry without a root fails loudly", async () => {
  await expect(import("./devMain")).rejects.toThrow("dev.html has no #root element");
});
