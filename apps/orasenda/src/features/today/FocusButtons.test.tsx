import { argsOf, KEYBOARD, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { FocusButtons } from "./FocusButtons";
import { renderToday } from "./Today.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const binding = (id: "fullScreen" | "floater") => {
  const action = KEYBOARD.actions.find((a) => a.id === id);
  if (!action) throw new Error(`no ${id} in the fixture`);
  return action.app;
};

test("focus_buttons_name_their_keys_from_the_registry", () => {
  render(
    <FocusButtons
      fullScreen={binding("fullScreen")}
      floater={binding("floater")}
      onRun={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "Full screen" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+F",
  );
  expect(screen.getByRole("button", { name: "Floating timer" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Shift+Meta+T",
  );
});

test("focus_buttons_without_keys_name_none", () => {
  render(<FocusButtons fullScreen={undefined} floater={undefined} onRun={() => {}} />);
  expect(screen.getByRole("button", { name: "Full screen" })).not.toHaveAttribute(
    "aria-keyshortcuts",
  );
});

test("focus_buttons_report_which_was_pressed", () => {
  const onRun = vi.fn();
  render(<FocusButtons fullScreen={undefined} floater={undefined} onRun={onRun} />);
  fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
  fireEvent.click(screen.getByRole("button", { name: "Floating timer" }));
  expect(onRun.mock.calls).toEqual([["fullScreen"], ["floater"]]);
});

test("today_full_screen_one_step", async () => {
  const { backend } = await renderToday();
  expect(screen.queryByRole("button", { name: "Focus view" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
  await settle();
  // One command, the registry's: no menu, no display choice, no dialog.
  expect(argsOf(backend.calls, "action_run")).toEqual([{ id: "fullScreen" }]);
  expect(argsOf(backend.calls, "native_menu_popup")).toEqual([]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("today_floating_timer_goes_through_the_registry", async () => {
  const { backend } = await renderToday();
  fireEvent.click(screen.getByRole("button", { name: "Floating timer" }));
  await settle();
  expect(argsOf(backend.calls, "action_run")).toEqual([{ id: "floater" }]);
});

test("today_f_is_not_a_key_any_more", async () => {
  const { backend } = await renderToday();
  fireEvent.keyDown(document.body, { key: "f" });
  await settle();
  expect(argsOf(backend.calls, "action_run")).toEqual([]);
  expect(argsOf(backend.calls, "native_menu_popup")).toEqual([]);
});

test("today_failed_open_says_so_and_try_again_repeats_it", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const { backend } = await renderToday({
    action_run: () => (fail ? Promise.reject(new Error("no")) : undefined),
  });
  fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
  await settle();
  expect(screen.getByText("The focus view didn't open.")).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again opening the focus view" }));
  await settle();
  expect(argsOf(backend.calls, "action_run")).toEqual([{ id: "fullScreen" }, { id: "fullScreen" }]);
  expect(screen.queryByText("The focus view didn't open.")).toBeNull();
});
