import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { AppRef_Serialize, SpikeError, UsageSegment_Serialize } from "../bindings";
import { DevPanel } from "./DevPanel";
import { argsOf, type Call, mockBackend, type Replies } from "./testing";

const SAFARI: AppRef_Serialize = { bundleId: "com.apple.Safari", name: "Safari", pid: 101 };
const NOTES: AppRef_Serialize = { bundleId: "com.apple.Notes", name: "Notes", pid: 102 };

function at(hours: number, minutes: number): number {
  return Date.UTC(2026, 10, 8, hours, minutes);
}

function spikeBackend({
  enabled = true,
  apps = [SAFARI, NOTES],
  usage = [] as UsageSegment_Serialize[],
  replies = {} as Replies,
} = {}): Call[] {
  return mockBackend({
    spike_status: () => ({ enabled, platformSupported: true }),
    spike_running_apps: () => apps,
    spike_usage: () => usage,
    spike_rule: () => ({ targets: [], action: "hide" }),
    spike_set_rule: () => null,
    ...replies,
  });
}

const PLATFORM_ERROR: SpikeError = { kind: "platform", message: "refused" };

/** A reply that rejects the way a Tauri command error does: with the serialized error. */
function rejects(): () => Promise<never> {
  return () => Promise.reject(PLATFORM_ERROR);
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

test("dev_panel_shows_ongoing_idle_row", async () => {
  spikeBackend({
    usage: [{ bundleId: "com.apple.Notes", name: "Notes", startMs: at(14, 9), endMs: at(14, 15) }],
  });
  await renderPanel();

  expect(usageRows()).toEqual(["idle · 14:15–now", "Notes · 14:09–14:15"]);
});

test("dev_panel_uncheck_removes_target", async () => {
  const calls = spikeBackend();
  await renderPanel();
  const safari = screen.getByRole("checkbox", { name: "Safari" });

  await act(async () => {
    fireEvent.click(safari);
  });
  await act(async () => {
    fireEvent.click(safari);
  });

  expect(argsOf(calls, "spike_set_rule")).toEqual([
    { rule: { targets: ["com.apple.Safari"], action: "hide" } },
    { rule: { targets: [], action: "hide" } },
  ]);
  expect(safari).not.toBeChecked();
});

test("dev_panel_fast_changes_build_on_each_other", async () => {
  const pending: Array<() => void> = [];
  const calls = spikeBackend({
    replies: {
      spike_set_rule: () => new Promise((resolve) => pending.push(() => resolve(null))),
    },
  });
  await renderPanel();

  // Notes is checked before the reply for Safari arrives.
  await act(async () => {
    fireEvent.click(screen.getByRole("checkbox", { name: "Safari" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("checkbox", { name: "Notes" }));
  });
  await act(async () => {
    for (const resolve of pending) resolve();
  });

  expect(argsOf(calls, "spike_set_rule")).toEqual([
    { rule: { targets: ["com.apple.Safari"], action: "hide" } },
    { rule: { targets: ["com.apple.Safari", "com.apple.Notes"], action: "hide" } },
  ]);
  expect(screen.getByRole("checkbox", { name: "Safari" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Notes" })).toBeChecked();
});

test("dev_panel_apps_failure_shows_note", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  spikeBackend({ replies: { spike_running_apps: rejects(), spike_usage: rejects() } });
  await renderPanel();

  const group = screen.getByRole("group", { name: "Apps to intercept" });
  expect(within(group).getByText("Apps unavailable.")).toHaveClass("spike-note");
  expect(within(group).queryByText("No apps to show.")).toBeNull();
  expect(screen.getByText("Usage unavailable.")).toHaveClass("spike-note");
  expect(screen.queryByText("Nothing recorded yet.")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(error).toHaveBeenCalledTimes(2);
});

test("dev_panel_set_rule_failure_shows_note", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const calls = spikeBackend({
    replies: { spike_set_rule: () => (fail ? Promise.reject(PLATFORM_ERROR) : null) },
  });
  await renderPanel();
  const apps = screen.getByRole("group", { name: "Apps to intercept" });
  const actions = screen.getByRole("group", { name: "When I go back to focus" });

  await act(async () => {
    fireEvent.click(screen.getByRole("radio", { name: "Quit the app" }));
  });

  const note = screen.getByText("That change was not saved.");
  expect(note).toHaveClass("spike-note");
  expect(actions.nextElementSibling).toBe(note);
  expect(apps.nextElementSibling).not.toBe(note);
  // The controls stay on the last accepted rule.
  expect(screen.getByRole("radio", { name: "Hide the app" })).toBeChecked();
  expect(error).toHaveBeenCalledTimes(1);

  fail = false;
  await act(async () => {
    fireEvent.click(screen.getByRole("checkbox", { name: "Safari" }));
  });

  expect(screen.queryByText("That change was not saved.")).toBeNull();
  expect(argsOf(calls, "spike_set_rule").at(-1)).toEqual({
    rule: { targets: ["com.apple.Safari"], action: "hide" },
  });
});

test("dev_panel_shows_the_backend_rule_after_a_reload", async () => {
  spikeBackend({
    replies: { spike_rule: () => ({ targets: ["com.apple.Notes"], action: "close" }) },
  });
  await renderPanel();

  expect(screen.getByRole("checkbox", { name: "Notes" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Safari" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "Quit the app" })).toBeChecked();
});
