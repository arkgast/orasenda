import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { argsOf, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  flush,
  liveText,
  press,
  runBackend,
  singleKeys,
  startRun,
  stepName,
} from "./RunView.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  resetSettingsQueueForTests();
  vi.restoreAllMocks();
});

const finished = () => document.querySelector("[data-slot=routine-step-finished]")?.textContent;
const progress = () => document.querySelector("[data-slot=routine-step-progress]")?.textContent;

test("the_whole_run_by_keyboard_enter_s_enter_then_back", async () => {
  const { backend } = await startRun();
  expect(screen.getByRole("heading", { level: 1, name: "Morning Light & Movement" })).toBeTruthy();
  expect(progress()).toBe("Step 1 of 3");
  expect(stepName()).toHaveTextContent("Drink a glass of water");
  expect(document.activeElement).toBe(stepName());
  expect(liveText()).toBe("Step 1 of 3. Drink a glass of water");

  await press("Enter");
  expect(progress()).toBe("Step 2 of 3");
  expect(document.activeElement).toBe(stepName());
  expect(stepName()).toHaveTextContent("Move for 5–10 minutes");
  expect(liveText()).toBe("Step 2 of 3. Move for 5–10 minutes");

  await press("s");
  expect(progress()).toBe("Step 3 of 3");
  expect(document.activeElement).toBe(stepName());
  expect(liveText()).toBe("Step 3 of 3. Get outdoor light");

  await press("Enter");
  expect(argsOf(backend.calls, "run_step")).toEqual([
    { runId: "run-1", outcome: "done" },
    { runId: "run-1", outcome: "skip" },
    { runId: "run-1", outcome: "done" },
  ]);
  expect(finished()).toBe("Routine finished. 2 of 3 done today.");
  expect(liveText()).toBe("Routine finished. 2 of 3 done today.");
  const back = screen.getByRole("button", { name: "Back to routines" });
  expect(document.activeElement).toBe(back);

  // Esc leaves the finished run for the overview, and focus lands on the page's heading.
  await press("Escape");
  expect(screen.queryByRole("button", { name: "Back to routines" })).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Routines" })).toBe(document.activeElement);
});

test("esc_ends_the_routine_early_with_rusts_line", async () => {
  const { backend } = await startRun();
  await press("Enter");
  await press("Escape");
  expect(argsOf(backend.calls, "run_end")).toEqual([{ runId: "run-1" }]);
  expect(finished()).toBe("Routine ended. 1 of 3 done today.");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back to routines" }));
  fireEvent.click(document.activeElement as HTMLElement);
  await flush();
  expect(screen.getByRole("heading", { level: 1, name: "Routines" })).toBeTruthy();
});

test("the_end_routine_button_ends_it_too", async () => {
  const { backend } = await startRun();
  fireEvent.click(screen.getByRole("button", { name: "End routine" }));
  await flush();
  expect(argsOf(backend.calls, "run_end")).toHaveLength(1);
  expect(finished()).toBe("Routine ended. 0 of 3 done today.");
});

test("with_single_keys_off_enter_and_s_at_rest_do_nothing_and_the_buttons_work", async () => {
  const { backend } = await startRun({ ...runBackend(), ...singleKeys(false) });
  expect(document.activeElement).toBe(stepName());
  await press("Enter");
  await press("s");
  expect(argsOf(backend.calls, "run_step")).toEqual([]);
  expect(progress()).toBe("Step 1 of 3");
  // No key hint shows for keys that don't work.
  expect(screen.getByRole("button", { name: "Done" })).not.toHaveAttribute("aria-keyshortcuts");
  expect(screen.getByRole("button", { name: "Skip for today" })).not.toHaveAttribute(
    "aria-keyshortcuts",
  );

  fireEvent.click(screen.getByRole("button", { name: "Skip for today" }));
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await flush();
  expect(argsOf(backend.calls, "run_step")).toEqual([
    { runId: "run-1", outcome: "skip" },
    { runId: "run-1", outcome: "done" },
  ]);
  expect(document.activeElement).toBe(stepName());

  // Esc is the standard leave key and still ends the routine.
  await press("Escape");
  expect(argsOf(backend.calls, "run_end")).toHaveLength(1);
});

test("keys_show_their_hints_while_single_keys_are_on", async () => {
  await startRun();
  expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Enter",
  );
  expect(screen.getByRole("button", { name: "Skip for today" })).toHaveAttribute(
    "aria-keyshortcuts",
    "S",
  );
  expect(screen.getByRole("button", { name: "End routine" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Escape",
  );
});

test("s_on_a_focused_button_is_left_to_the_button", async () => {
  const { backend } = await startRun();
  screen.getByRole("button", { name: "Done" }).focus();
  await press("s");
  expect(argsOf(backend.calls, "run_step")).toEqual([]);
});

test("a_second_press_while_an_answer_is_in_flight_is_not_a_second_answer", async () => {
  const { backend } = await startRun();
  fireEvent.keyDown(stepName(), { key: "Enter" });
  fireEvent.keyDown(stepName(), { key: "Enter" });
  await flush();
  expect(argsOf(backend.calls, "run_step")).toHaveLength(1);
  expect(progress()).toBe("Step 2 of 3");
});

test("when_the_settings_cant_be_read_single_keys_stay_off_and_the_row_says_so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { backend } = await startRun({
    ...runBackend(),
    settings_get: () => {
      throw "store";
    },
  });
  const row = document.querySelector("[data-slot=routine-run] [data-slot=inline-notice]");
  expect(row?.textContent).toBe(
    "Your settings can't be read right now, so Enter and S work only on the buttons.",
  );
  expect(row).toHaveAttribute("data-tone", "attention");
  await press("Enter");
  expect(argsOf(backend.calls, "run_step")).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await flush();
  expect(argsOf(backend.calls, "run_step")).toEqual([{ runId: "run-1", outcome: "done" }]);
});

test("esc_with_an_overlay_open_closes_the_overlay_and_does_not_end_the_run", async () => {
  const { backend } = await startRun();
  // An overlay that closes itself on Esc, as the command palette does.
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  const field = document.createElement("input");
  overlay.append(field);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") overlay.remove();
  });
  document.body.append(overlay);
  field.focus();
  await press("Escape");
  expect(document.body.contains(overlay)).toBe(false);
  expect(argsOf(backend.calls, "run_end")).toEqual([]);
  expect(progress()).toBe("Step 1 of 3");

  // With the overlay gone, Esc ends the routine.
  await press("Escape");
  expect(argsOf(backend.calls, "run_end")).toHaveLength(1);
});
