import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { argsOf, emitTimer, PAUSED, RUNNING, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderToday, savedSettings } from "./Today.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

function key(k: string, init: KeyboardEventInit = {}, target: Element = document.body): boolean {
  return fireEvent.keyDown(target, { key: k, ...init });
}

test("space_toggles_on_body", async () => {
  const { backend } = await renderToday();
  key(" ");
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
  await emitTimer(RUNNING);
  key(" ");
  await settle();
  expect(argsOf(backend.calls, "timer_pause")).toHaveLength(1);
  await emitTimer(PAUSED);
  key(" ");
  await settle();
  expect(backend.calls.filter((c) => c.cmd === "timer_resume")).toHaveLength(1);
});

test("space_ignored_in_field_and_on_button", async () => {
  const { backend } = await renderToday();
  const field = document.body.appendChild(document.createElement("input"));
  key(" ", {}, field);
  key(" ", {}, screen.getByRole("button", { name: /Just 2 minutes/ }));
  key(" ", { metaKey: true });
  key(" ", { repeat: true });
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toEqual([]);
});

test("p_opens_preset_popover", async () => {
  await renderToday();
  key("p");
  await settle();
  expect(screen.getByRole("menu")).toBeInTheDocument();
});

test("keys_off_do_nothing", async () => {
  const { backend } = await renderToday(savedSettings({ singleKey: false }));
  expect(key(" ")).toBe(true);
  key("p");
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toEqual([]);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("captions_drop_single_keys_when_off", async () => {
  const on = await renderToday();
  // The focus buttons name their registry keys, never a single key.
  expect(screen.getByRole("button", { name: "Full screen" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+F",
  );
  expect(screen.getByRole("button", { name: /Start focus/ })).toHaveAttribute(
    "aria-keyshortcuts",
    "Space Meta+Enter",
  );
  expect(screen.getByRole("button", { name: /Change preset|Gentle|Steady|Deep/ })).toHaveAttribute(
    "aria-keyshortcuts",
    "P",
  );
  on.unmount();
  await renderToday(savedSettings({ singleKey: false }));
  expect(screen.getByRole("button", { name: "Full screen" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+F",
  );
  expect(screen.getByRole("button", { name: /Start focus/ })).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+Enter",
  );
  expect(document.querySelector('[aria-haspopup="menu"][aria-keyshortcuts="P"]')).toBeNull();
});
