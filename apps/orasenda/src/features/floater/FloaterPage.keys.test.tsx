import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { argsOf, emitTimer, IDLE, mockBackend, PAUSED, RUNNING, settle } from "../../test/fixtures";
import { FloaterPage } from "./FloaterPage";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

async function mount(view: typeof IDLE) {
  const backend = mockBackend({ timer_view: () => view });
  render(<FloaterPage />);
  await settle();
  return backend;
}

async function press(key: string, init: KeyboardEventInit = {}, target: Element = document.body) {
  fireEvent.keyDown(target, { key, ...init });
  await settle();
}

// The Webview route: the page hears the keys itself. The Monitor route (Rust) calls the same
// paths, and the page's handlers stay but never see the keys.
test("floater_space_pauses_resumes_starts", async () => {
  const backend = await mount(RUNNING);
  await press(" ");
  expect(argsOf(backend.calls, "timer_pause")).toHaveLength(1);
  await emitTimer(PAUSED);
  await press(" ");
  expect(argsOf(backend.calls, "timer_resume")).toHaveLength(1);
  await emitTimer(IDLE);
  await press(" ");
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
});

test("floater_return_calls_main_show", async () => {
  const backend = await mount(RUNNING);
  await press("Enter");
  expect(argsOf(backend.calls, "main_show")).toHaveLength(1);
});

test("floater_escape_closes", async () => {
  const backend = await mount(RUNNING);
  await press("Escape");
  expect(argsOf(backend.calls, "focus_view_close")).toHaveLength(1);
});

test("floater_keys_ignore_modifiers_and_auto_repeat", async () => {
  const backend = await mount(RUNNING);
  await press(" ", { repeat: true });
  await press(" ", { metaKey: true });
  await press("Enter", { shiftKey: true });
  await press("Escape", { altKey: true });
  expect(backend.calls.map((call) => call.cmd)).not.toContain("timer_pause");
  expect(backend.calls.map((call) => call.cmd)).not.toContain("main_show");
  expect(backend.calls.map((call) => call.cmd)).not.toContain("focus_view_close");
});

test("floater_space_and_return_on_a_focused_button_are_the_buttons_own", async () => {
  const backend = await mount(RUNNING);
  const open = screen.getByRole("button", { name: "Open Orasenda" });
  await press(" ", {}, open);
  await press("Enter", {}, open);
  // The browser turns those into a click; the page adds nothing of its own.
  expect(argsOf(backend.calls, "timer_pause")).toEqual([]);
  expect(argsOf(backend.calls, "main_show")).toEqual([]);
});

test("floater_keys_wait_for_a_view", async () => {
  const backend = mockBackend({ timer_view: () => new Promise(() => {}) });
  render(<FloaterPage />);
  await settle();
  await press(" ");
  expect(argsOf(backend.calls, "timer_start")).toEqual([]);
  expect(argsOf(backend.calls, "timer_pause")).toEqual([]);
});
