import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { AppRef_Serialize, UsageSegment_Serialize } from "../bindings";
import { DevPanel } from "./DevPanel";
import { argsOf, type Call, mockBackend } from "./testing";

const SAFARI: AppRef_Serialize = { bundleId: "com.apple.Safari", name: "Safari", pid: 101 };
const NOTES: AppRef_Serialize = { bundleId: "com.apple.Notes", name: "Notes", pid: 102 };

function at(hours: number, minutes: number): number {
  return Date.UTC(2026, 10, 8, hours, minutes);
}

function spikeBackend({
  enabled = true,
  apps = [SAFARI, NOTES],
  usage = [] as UsageSegment_Serialize[],
} = {}): Call[] {
  return mockBackend({
    spike_status: () => ({ enabled, platformSupported: true }),
    spike_running_apps: () => apps,
    spike_usage: () => usage,
    spike_set_rule: () => null,
  });
}

async function renderPanel(): Promise<HTMLElement> {
  const { container } = render(<DevPanel locale="en-GB" timeZone="UTC" />);
  // Let `spike_status`, the first fetches and `listen` settle.
  await act(async () => {});
  await act(async () => {});
  return container;
}

function usageRows(): string[] {
  const list = screen.getByRole("list", { name: "Recent usage" });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

afterEach(async () => {
  cleanup();
  await act(async () => {});
  clearMocks();
  vi.restoreAllMocks();
});

test("dev_panel_hidden_when_disabled", async () => {
  const calls = spikeBackend({ enabled: false });
  const container = await renderPanel();

  expect(container).toBeEmptyDOMElement();
  expect(argsOf(calls, "spike_running_apps")).toHaveLength(0);
  expect(argsOf(calls, "spike_usage")).toHaveLength(0);
});

test("dev_panel_check_sets_rule", async () => {
  const calls = spikeBackend();
  await renderPanel();

  const group = screen.getByRole("group", { name: "Apps to intercept" });
  expect(group).toHaveClass("os-choice-group");
  const safari = within(group).getByRole("checkbox", { name: "Safari" });
  expect(safari.closest("label")).toHaveClass("os-choice");
  expect(safari).not.toBeChecked();

  await act(async () => {
    fireEvent.click(safari);
  });

  expect(argsOf(calls, "spike_set_rule")).toEqual([
    { rule: { targets: ["com.apple.Safari"], action: "hide" } },
  ]);
  expect(safari).toBeChecked();
});

test("dev_panel_action_radio_sets_rule", async () => {
  const calls = spikeBackend();
  await renderPanel();

  const group = screen.getByRole("group", { name: "When I go back to focus" });
  expect(group).toHaveClass("os-choice-group");
  expect(within(group).getByRole("radio", { name: "Hide the app" })).toBeChecked();
  const quit = within(group).getByRole("radio", { name: "Quit the app" });
  expect(quit.closest("label")).toHaveClass("os-choice");

  await act(async () => {
    fireEvent.click(quit);
  });

  expect(argsOf(calls, "spike_set_rule")).toEqual([{ rule: { targets: [], action: "close" } }]);
  expect(quit).toBeChecked();
});

test("dev_panel_refresh_apps_refetches", async () => {
  const calls = spikeBackend();
  await renderPanel();

  const refresh = screen.getByRole("button", { name: "Refresh apps" });
  expect(refresh).toHaveClass("os-btn");
  await act(async () => {
    fireEvent.click(refresh);
  });

  expect(argsOf(calls, "spike_running_apps")).toHaveLength(2);
});

test("dev_panel_open_segment_shows_now", async () => {
  spikeBackend({
    usage: [{ bundleId: "com.apple.Safari", name: "Safari", startMs: at(14, 2), endMs: null }],
  });
  await renderPanel();

  expect(usageRows()).toEqual(["Safari · 14:02–now"]);
});

test("dev_panel_shows_idle_gap_rows", async () => {
  spikeBackend({
    usage: [
      { bundleId: "com.apple.Notes", name: "Notes", startMs: at(14, 15), endMs: null },
      { bundleId: "com.apple.Mail", name: "Mail", startMs: at(14, 9), endMs: at(14, 15) },
      { bundleId: "com.apple.Safari", name: "Safari", startMs: at(14, 2), endMs: at(14, 5) },
    ],
  });
  await renderPanel();

  expect(usageRows()).toEqual([
    "Notes · 14:15–now",
    "Mail · 14:09–14:15",
    "idle · 14:05–14:09",
    "Safari · 14:02–14:05",
  ]);
});
