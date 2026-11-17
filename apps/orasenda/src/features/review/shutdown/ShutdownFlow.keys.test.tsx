import { argsOf, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { heading, live, openShutdown, press } from "./ShutdownFlow.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("shutdown_by_keyboard_end_to_end", async () => {
  const { backend, onClose } = await openShutdown();
  expect(heading()).toHaveTextContent("Unfinished tasks");
  // Choose one task with the keyboard, continue, look at tomorrow, answer one prompt, finish.
  await press("Back to Backlog Write notes");
  await press("Continue");
  expect(argsOf(backend.calls, "shutdown_move")).toEqual([{ ids: ["task-2"] }]);
  expect(heading()).toHaveTextContent("Tomorrow");
  expect(screen.getByText("Fix sync bug")).toBeInTheDocument();
  await press("Continue");
  expect(heading()).toHaveTextContent("Reflect");
  fireEvent.change(screen.getByLabelText("What went well?"), {
    target: { value: "  A calm day " },
  });
  await press("Continue");
  expect(argsOf(backend.calls, "shutdown_complete")).toEqual([
    {
      day: "2026-11-16",
      answers: { wentWell: "  A calm day ", toImprove: null, outsideControl: null },
    },
  ]);
  expect(heading()).toHaveTextContent("Shutdown complete.");
  await press("Back to Review");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("focus_heading_each_step", async () => {
  await openShutdown();
  expect(document.activeElement).toBe(heading());
  await press("Continue");
  expect(heading()).toHaveTextContent("Tomorrow");
  expect(document.activeElement).toBe(heading());
  await press("Continue");
  expect(heading()).toHaveTextContent("Reflect");
  expect(document.activeElement).toBe(heading());
  await press("Continue");
  // The last step focuses its one button.
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back to Review" }));
});

test("live_region_step_words", async () => {
  await openShutdown();
  expect(live()).toHaveAttribute("aria-live", "polite");
  expect(live()).toHaveTextContent("Step 1 of 4, Unfinished tasks");
  await press("Continue");
  expect(live()).toHaveTextContent("Step 2 of 4, Tomorrow");
  await press("Continue");
  expect(live()).toHaveTextContent("Step 3 of 4, Reflect");
  expect(document.querySelectorAll('[aria-live="polite"][data-slot="flow-live"]')).toHaveLength(1);
});

test("esc_ends_even_when_focus_is_outside_the_frame", async () => {
  const { onClose } = await openShutdown();
  (document.activeElement as HTMLElement | null)?.blur();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("esc_inside_the_frame_ends_once", async () => {
  const { onClose } = await openShutdown();
  fireEvent.keyDown(screen.getByRole("button", { name: "Continue" }), { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("esc_leaves_an_open_dialog_to_close_first", async () => {
  const { onClose } = await openShutdown();
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  fireEvent.keyDown(document.body, { key: "Escape" });
  dialog.remove();
  expect(onClose).not.toHaveBeenCalled();
});
