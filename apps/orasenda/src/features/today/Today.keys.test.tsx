import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { argsOf, emitTimer, RUNNING, settle } from "../../test/fixtures";
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

test("f_opens_focus_view_menu", async () => {
  const { backend } = await renderToday({ native_menu_popup: () => null });
  key("f");
  await settle();
  expect(argsOf(backend.calls, "native_menu_popup")).toHaveLength(1);
});

test("p_opens_preset_popover", async () => {
  await renderToday();
  key("p");
  await settle();
  expect(screen.getByRole("menu")).toBeInTheDocument();
});

test("keys_off_do_nothing", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ singleKey: false }),
    native_menu_popup: () => null,
  });
  expect(key(" ")).toBe(true);
  key("f");
  key("p");
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toEqual([]);
  expect(argsOf(backend.calls, "native_menu_popup")).toEqual([]);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("captions_drop_single_keys_when_off", async () => {
  const on = await renderToday();
  expect(screen.getByRole("button", { name: "Focus view" })).toHaveAttribute(
    "aria-keyshortcuts",
    "F",
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
  expect(screen.getByRole("button", { name: "Focus view" })).not.toHaveAttribute(
    "aria-keyshortcuts",
  );
  expect(screen.getByRole("button", { name: /Start focus/ })).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+Enter",
  );
  expect(document.querySelector('[aria-haspopup="menu"][aria-keyshortcuts="P"]')).toBeNull();
});
