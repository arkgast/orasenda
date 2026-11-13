import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { argsOf, DISPLAYS, emitTimer, PAUSED, RUNNING, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderToday, statusNodes } from "./Today.support";

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

type Item = { id: string; label: string; accelerator: string | null };

function popupItems(calls: Array<{ cmd: string; args: unknown }>): Item[] {
  const request = argsOf(calls, "native_menu_popup").at(-1) as { request: { items: Item[] } };
  return request.request.items;
}

async function press() {
  fireEvent.click(screen.getByRole("button", { name: "Focus view" }));
  await settle();
}

test("focus_view_button_one_display_items", async () => {
  const { backend } = await renderToday({
    displays_list: () => [DISPLAYS[0]],
    native_menu_popup: () => null,
  });
  const button = screen.getByRole("button", { name: "Focus view" });
  expect(button).toHaveAttribute("aria-haspopup", "menu");
  expect(button).toHaveAttribute("aria-keyshortcuts", "F");
  await press();

  expect(popupItems(backend.calls)).toEqual([
    { id: "fullScreen:1", label: "Full screen", accelerator: "Cmd+Shift+F", checked: null },
    {
      id: "floater",
      label: "Floating timer, hide Orasenda",
      accelerator: "Cmd+Shift+T",
      checked: null,
    },
  ]);
});

test("focus_view_button_several_displays_first_has_shortcut", async () => {
  const { backend } = await renderToday({ native_menu_popup: () => null });
  await press();

  const items = popupItems(backend.calls);
  expect(items.map((item) => [item.label, item.accelerator])).toEqual([
    ["Full screen on Built-in Retina Display", "Cmd+Shift+F"],
    ["Full screen on DELL U2720Q", null],
    ["Floating timer, hide Orasenda", "Cmd+Shift+T"],
  ]);
  expect(items.map((item) => item.id)).toEqual(["fullScreen:1", "fullScreen:2", "floater"]);
});

test("focus_view_button_is_available_idle_running_and_paused", async () => {
  await renderToday();
  expect(screen.getByRole("button", { name: "Focus view" })).toBeInTheDocument();
  await emitTimer(RUNNING);
  expect(screen.getByRole("button", { name: "Focus view" })).toBeInTheDocument();
  await emitTimer(PAUSED);
  expect(screen.getByRole("button", { name: "Focus view" })).toBeInTheDocument();
});

test("focus_view_choice_calls_open", async () => {
  const choices = ["fullScreen:2", "floater"];
  const { backend } = await renderToday({ native_menu_popup: () => choices.shift() });
  await press();
  await press();

  expect(argsOf(backend.calls, "focus_view_open")).toEqual([
    { target: { kind: "fullScreen", displayId: "2" } },
  ]);
  // The floater goes through the one entry point, so its de-duplication applies.
  expect(argsOf(backend.calls, "action_run")).toEqual([{ id: "floater" }]);
  expect(statusNodes()).toHaveLength(0);
});

test("focus_view_dismissed_menu_does_nothing", async () => {
  const { backend } = await renderToday({ native_menu_popup: () => null });
  await press();

  expect(argsOf(backend.calls, "focus_view_open")).toEqual([]);
  expect(screen.getByRole("button", { name: "Focus view" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("focus_view_button_hidden_without_displays", async () => {
  await renderToday({ displays_list: () => [] });
  expect(screen.queryByRole("button", { name: "Focus view" })).toBeNull();
});

function failingOpen() {
  const answers = [false, true];
  return {
    native_menu_popup: () => "floater",
    action_run: () => {
      if (answers.shift() === false) {
        throw "no window";
      }
      return null;
    },
  };
}

test("focus_view_open_failure_status_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday(failingOpen());
  await press();

  expect(statusNodes()).toHaveLength(1);
  expect(statusNodes()[0]).toHaveTextContent("The focus view didn't open.");
  expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
});

test("focus_view_try_again_repeats_open", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { backend } = await renderToday(failingOpen());
  await press();
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  await settle();

  expect(argsOf(backend.calls, "action_run")).toEqual([{ id: "floater" }, { id: "floater" }]);
  expect(statusNodes()).toHaveLength(0);
});

test("focus_view_line_clears_on_transition", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday(failingOpen());
  await press();
  expect(statusNodes()).toHaveLength(1);

  await emitTimer(RUNNING);
  expect(statusNodes()).toHaveLength(0);
});
