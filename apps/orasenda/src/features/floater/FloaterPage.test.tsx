import {
  argsOf,
  emitMilestone,
  emitTimer,
  IDLE,
  mockBackend,
  PAUSED,
  RUNNING,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { FloaterPage } from "./FloaterPage";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
});

async function mount(replies: Parameters<typeof mockBackend>[0] = {}) {
  const backend = mockBackend({ timer_view: () => RUNNING, ...replies });
  render(
    <StrictMode>
      <FloaterPage />
    </StrictMode>,
  );
  await settle();
  return backend;
}

type MenuRequest = { items: Array<{ id: string; label: string }>; x: number; y: number };

test("floater_follows_the_saved_theme", async () => {
  await mount({ settings_get: () => ({ theme: "dark" }) });
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("floater_renders_the_view_as_a_floating_timer_with_a_drag_region", async () => {
  await mount();
  const group = screen.getByRole("group", { name: "Floating timer, Focus" });
  expect(group).toHaveAttribute("data-tauri-drag-region", "deep");
  expect(group).toHaveTextContent("24:59");
  expect(screen.getByRole("button", { name: "Pause session" })).toBeVisible();
  expect(screen.getByRole("main", { name: "Floating timer" })).toBeVisible();
});

test("floater_never_calls_timer_state", async () => {
  const backend = await mount({ timer_view: () => IDLE });
  await emitTimer(RUNNING);
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  expect(argsOf(backend.calls, "timer_state")).toEqual([]);
  expect(argsOf(backend.calls, "timer_view").length).toBeGreaterThan(0);
  expect(backend.live("timer-tick")).toBe(1);
});

test("floater_has_no_end_button", async () => {
  for (const view of [RUNNING, PAUSED, IDLE]) {
    await mount({ timer_view: () => view });
    expect(screen.queryByRole("button", { name: /^(end|stop|close)/i })).toBeNull();
    cleanup();
    clearMocks();
  }
});

test("floater_buttons_pause_resume_start_and_open", async () => {
  const backend = await mount();
  fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
  await settle();
  await emitTimer(PAUSED);
  fireEvent.click(screen.getByRole("button", { name: "Resume session" }));
  await settle();
  await emitTimer(IDLE);
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Open Orasenda" }));
  await settle();
  expect(argsOf(backend.calls, "timer_pause")).toHaveLength(1);
  expect(argsOf(backend.calls, "timer_resume")).toHaveLength(1);
  // The saved preset, not the quick two minutes.
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
  expect(argsOf(backend.calls, "main_show")).toHaveLength(1);
});

test("floater_shows_ended_after_the_ended_milestone", async () => {
  await mount();
  await emitTimer(IDLE);
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  expect(screen.getByRole("group", { name: "Floating timer, Session ended" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Session ended.");
});

test("floater_unreadable_view_says_so_kindly", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await mount({ timer_view: () => Promise.reject({ kind: "store", message: "no timer" }) });
  expect(screen.getByText("Orasenda can't reach the timer.")).toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
});

test("floater_a_failed_command_is_logged_and_the_view_stays", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await mount({ timer_pause: () => Promise.reject({ kind: "store", message: "disk full" }) });
  fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
  await settle();
  expect(error).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Pause session" })).toBeVisible();
});

async function contextMenu(view: typeof IDLE, chosen: string | null, ended = false) {
  const backend = await mount({
    timer_view: () => view,
    native_menu_popup: () => chosen,
  });
  if (ended) {
    await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  }
  fireEvent.contextMenu(screen.getByRole("group"), { clientX: 12, clientY: 20 });
  await settle();
  const requests = argsOf(backend.calls, "native_menu_popup") as Array<{ request: MenuRequest }>;
  return { backend, requests };
}

test("floater_context_menu_items_per_state", async () => {
  const labels = async (view: typeof IDLE, ended = false) => {
    const { requests } = await contextMenu(view, null, ended);
    expect(requests).toHaveLength(1);
    const labelsOf = requests[0]?.request.items.map((item) => item.label);
    cleanup();
    clearMocks();
    return labelsOf;
  };
  expect(await labels(RUNNING)).toEqual(["Close floating timer"]);
  expect(await labels(PAUSED)).toEqual(["Close floating timer"]);
  expect(await labels(IDLE)).toEqual(["Start focus", "Close floating timer"]);
  expect(await labels(IDLE, true)).toEqual(["Start focus", "Close floating timer"]);
});

test("floater_context_menu_opens_at_the_pointer_and_close_closes", async () => {
  const { backend, requests } = await contextMenu(RUNNING, "close");
  expect(requests[0]?.request).toMatchObject({ x: 12, y: 20 });
  expect(argsOf(backend.calls, "focus_view_close")).toHaveLength(1);
});

test("floater_context_menu_start_starts_the_saved_preset", async () => {
  const { backend } = await contextMenu(IDLE, "start");
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
});

test("floater_context_menu_dismissed_does_nothing", async () => {
  const { backend } = await contextMenu(RUNNING, null);
  expect(argsOf(backend.calls, "focus_view_close")).toEqual([]);
  expect(argsOf(backend.calls, "timer_start")).toEqual([]);
});

test("floater_never_asks_for_key_focus_on_a_tick", async () => {
  const backend = await mount();
  await emitTimer(PAUSED);
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  const names = backend.calls.map((call) => call.cmd);
  expect(names.filter((name) => name.startsWith("focus_view") || name === "main_show")).toEqual([]);
});
