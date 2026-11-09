import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Profiler, StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import type { AppInfo } from "./bindings";
import { events } from "./bindings";

const INFO: AppInfo = { name: "Orasenda", version: "0.1.0", os: "macos", arch: "aarch64" };
const TICK_MS = Date.UTC(2026, 10, 8, 14, 32, 5);

// Ids of `clock-tick` listeners registered and not yet unlistened. Counted here because the
// event mock in @tauri-apps/api 2.12.4 never removes a listener on unlisten.
let liveClockListeners: Set<number>;
// Every `clock-tick` handler in subscription order, kept after unlisten so a test can deliver
// an event that was already in flight when its subscription was cleaned up.
let clockHandlers: Array<(event: unknown) => void>;

type Invoke = (cmd: string, args?: unknown, options?: unknown) => Promise<unknown>;
type Internals = { invoke: Invoke; callbacks: Map<number, (event: unknown) => void> };

function mockBackend(
  appInfo: () => Promise<AppInfo>,
  { failListen = false, spikeEnabled = false } = {},
): void {
  mockIPC(
    (cmd) => {
      if (cmd === "app_info") return appInfo();
      if (cmd === "spike_status") return { enabled: spikeEnabled, platformSupported: true };
      if (spikeEnabled && (cmd === "spike_running_apps" || cmd === "spike_usage")) return [];
      if (spikeEnabled && cmd === "spike_rule") return { targets: [], action: "hide" };
      throw new Error(`unexpected command ${cmd}`);
    },
    { shouldMockEvents: true },
  );
  // mockIPC installs these on a global that @tauri-apps/api doesn't type.
  const internals = (window as unknown as { __TAURI_INTERNALS__: Internals }).__TAURI_INTERNALS__;
  const invoke = internals.invoke;
  internals.invoke = async (cmd, args, options) => {
    const fields = args as { event?: string; eventId?: number; handler?: number };
    const isClockListen = fields.event === "clock-tick" && cmd === "plugin:event|listen";
    if (isClockListen && failListen) {
      throw new Error("core:event:allow-listen not granted");
    }
    if (isClockListen) {
      const handler = internals.callbacks.get(fields.handler as number);
      if (handler) clockHandlers.push(handler);
    }
    const result = await invoke(cmd, args, options);
    if (isClockListen) {
      liveClockListeners.add(result as number);
    }
    if (fields.event === "clock-tick" && cmd === "plugin:event|unlisten") {
      liveClockListeners.delete(fields.eventId as number);
    }
    return result;
  };
}

async function tick(epochMs: number): Promise<void> {
  await act(async () => {
    await events.clockTick.emit({ epochMs, clock: "", idleFinish: null });
  });
}

function clock(container: HTMLElement): HTMLTimeElement {
  const time = container.querySelector("time");
  if (!time) throw new Error("no <time> element");
  return time;
}

beforeEach(() => {
  liveClockListeners = new Set();
  clockHandlers = [];
});

afterEach(async () => {
  // Unmount (and unlisten) while the IPC mock is still installed.
  cleanup();
  await act(async () => {});
  clearMocks();
  vi.restoreAllMocks();
});

test("renders_heading_and_info_line", async () => {
  mockBackend(async () => INFO);
  const { container } = render(<App locale="en-US" timeZone="UTC" />);

  expect(screen.getByRole("heading", { level: 1, name: "Orasenda" })).toBeInTheDocument();
  expect(await screen.findByText("0.1.0 · macOS aarch64")).toBeInTheDocument();
  expect(container.querySelectorAll("main")).toHaveLength(1);
  expect(clock(container)).not.toHaveAttribute("aria-live");
});

test("rejected_app_info_shows_version_unavailable", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend(async () => {
    throw new Error("app_info not allowed");
  });
  render(<App locale="en-US" timeZone="UTC" />);

  const line = await screen.findByText("version unavailable");
  expect(line).toHaveClass("app-info");
  expect(line).not.toHaveAttribute("role");
  expect(screen.getByRole("heading", { level: 1, name: "Orasenda" })).toBeInTheDocument();
  expect(error).toHaveBeenCalledTimes(1);
});

test("clock_is_empty_before_first_tick", async () => {
  mockBackend(async () => INFO);
  const { container } = render(<App locale="en-US" timeZone="UTC" />);
  await screen.findByText("0.1.0 · macOS aarch64");

  expect(clock(container)).toBeEmptyDOMElement();
  expect(clock(container)).toHaveClass("app-clock-slot");
  expect(clock(container)).not.toHaveAttribute("dateTime");
});

test("clock_shows_formatted_time_after_tick", async () => {
  mockBackend(async () => INFO);
  const { container } = render(<App locale="en-US" timeZone="UTC" />);
  await screen.findByText("0.1.0 · macOS aarch64");

  await tick(TICK_MS);

  expect(clock(container)).toHaveTextContent(/^02:32\s?PM$/);
  expect(clock(container)).toHaveAttribute("dateTime", "2026-11-08T14:32:05.000Z");
});

test("strict_mode_one_emit_one_update", async () => {
  mockBackend(async () => INFO);
  const commits: string[] = [];
  const { container } = render(
    <StrictMode>
      <Profiler id="app" onRender={(_id, phase) => commits.push(phase)}>
        <App locale="en-US" timeZone="UTC" />
      </Profiler>
    </StrictMode>,
  );
  await screen.findByText("0.1.0 · macOS aarch64");
  await act(async () => {});
  expect(liveClockListeners.size).toBe(1);

  commits.length = 0;
  await tick(TICK_MS);

  expect(commits).toEqual(["update"]);
  expect(clock(container)).toHaveTextContent(/^02:32\s?PM$/);
});

test("tick_to_cleaned_up_subscription_is_ignored", async () => {
  mockBackend(async () => INFO);
  const commits: string[] = [];
  const { container } = render(
    <StrictMode>
      <Profiler id="app" onRender={(_id, phase) => commits.push(phase)}>
        <App locale="en-US" timeZone="UTC" />
      </Profiler>
    </StrictMode>,
  );
  await screen.findByText("0.1.0 · macOS aarch64");
  await act(async () => {});
  await tick(TICK_MS);
  // StrictMode subscribed twice; the first subscription was cleaned up.
  expect(clockHandlers).toHaveLength(2);
  const [cleanedUp] = clockHandlers;

  commits.length = 0;
  const later = Date.UTC(2026, 10, 8, 15, 45, 0);
  await act(async () => {
    cleanedUp?.({ event: "clock-tick", id: 0, payload: { epochMs: later } });
  });

  expect(commits).toEqual([]);
  expect(clock(container)).toHaveTextContent(/^02:32\s?PM$/);
});

test("rejected_clock_listen_shows_clock_unavailable", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend(async () => INFO, { failListen: true });
  const { container, unmount } = render(<App locale="en-US" timeZone="UTC" />);

  const slot = await screen.findByText("clock unavailable");
  expect(slot.tagName).toBe("P");
  expect(slot).toHaveClass("app-info", "app-clock-slot");
  expect(slot).not.toHaveAttribute("role");
  expect(slot).not.toHaveAttribute("aria-live");
  expect(container.querySelector("time")).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Orasenda" })).toBeInTheDocument();

  // Cleanup after a failed subscription has nothing to unlisten and logs nothing more.
  unmount();
  await act(async () => {});
  expect(error).toHaveBeenCalledTimes(1);
});

test("emit_after_unmount_is_ignored", async () => {
  mockBackend(async () => INFO);
  // Unmount before the `listen` promise resolves: the late listener must be removed too.
  const { unmount } = render(<App locale="en-US" timeZone="UTC" />);
  unmount();
  await act(async () => {});

  await expect(tick(TICK_MS)).resolves.toBeUndefined();
  expect(liveClockListeners.size).toBe(0);
});

test("enabled_spike_shows_dev_panel", async () => {
  mockBackend(async () => INFO, { spikeEnabled: true });
  render(<App locale="en-US" timeZone="UTC" />);

  expect(await screen.findByRole("group", { name: "Apps to intercept" })).toBeInTheDocument();
  expect(screen.getAllByRole("main")).toHaveLength(1);
});
