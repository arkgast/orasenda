import { argsOf, settle, shutdownView } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { heading, openShutdown, press, TWO } from "./ShutdownFlow.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("toggle_aria_pressed", async () => {
  await openShutdown();
  const write = screen.getByRole("button", { name: "Back to Backlog Write notes" });
  expect(write).toHaveAttribute("aria-pressed", "false");
  // quiet is the system's secondary button (button.md)
  expect(write).toHaveAttribute("data-variant", "quiet");
  expect(write.querySelector("svg")).toBeNull();
  // F4: pressed keeps the selection ground, not the quiet hover ground.
  expect(write.className).toContain("aria-pressed:bg-selection");
  fireEvent.click(write);
  expect(write).toHaveAttribute("aria-pressed", "true");
  expect(write).toHaveAttribute("data-variant", "quiet");
  expect(write.querySelector("svg")).not.toBeNull();
  expect(write.closest("li")).toHaveTextContent(/Goes to Backlog/);
  fireEvent.click(write);
  expect(write).toHaveAttribute("aria-pressed", "false");
  // A task with a running session says so in words and has no toggle.
  expect(screen.getByText("In progress")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Fix sync bug/ })).toBeNull();
});

test("nothing_selected_moves_nothing", async () => {
  const { backend } = await openShutdown();
  await press("Continue");
  expect(argsOf(backend.calls, "shutdown_move")).toEqual([]);
  expect(heading()).toHaveTextContent("Tomorrow");
});

test("no_unfinished_tasks_says_so", async () => {
  await openShutdown({}, shutdownView({ unfinished: [] }));
  expect(screen.getByText("Nothing unfinished.")).toBeInTheDocument();
});

test("nothing_movable_is_quiet_and_goes_on", async () => {
  await openShutdown({
    shutdown_move: () => {
      throw "notFound";
    },
  });
  await press("Back to Backlog Write notes");
  await press("Continue");
  expect(heading()).toHaveTextContent("Tomorrow");
  expect(document.querySelector('[data-slot="toast"]')).toBeNull();
  expect(screen.queryByText(/can't/)).toBeNull();
});

test("a_failed_move_stays_with_a_plain_line", async () => {
  await openShutdown({
    shutdown_move: () => {
      throw "store";
    },
  });
  await press("Back to Backlog Write notes");
  await press("Continue");
  expect(heading()).toHaveTextContent("Unfinished tasks");
  expect(screen.getByText("Orasenda can't move those tasks right now.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Back to Backlog Write notes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("end_keeps_earlier_steps", async () => {
  const { backend, onClose } = await openShutdown();
  await press("Back to Backlog Write notes");
  await press("Continue");
  await press("Continue");
  fireEvent.change(screen.getByLabelText("What went well?"), { target: { value: "Typed" } });
  await press(/^End/);
  expect(onClose).toHaveBeenCalledTimes(1);
  // The move stands; the unsaved typing is dropped and nothing was completed.
  expect(argsOf(backend.calls, "shutdown_move")).toHaveLength(1);
  expect(argsOf(backend.calls, "shutdown_complete")).toEqual([]);
});

test("not_now_on_reflect_sends_the_saved_answers", async () => {
  const saved = shutdownView({
    ...TWO,
    answers: { wentWell: "Shipped it", toImprove: null, outsideControl: null },
  });
  const { backend } = await openShutdown({}, saved);
  await press("Continue");
  await press("Continue");
  expect(screen.getByLabelText("What went well?")).toHaveValue("Shipped it");
  fireEvent.change(screen.getByLabelText("What went well?"), { target: { value: "Changed" } });
  await press("Not now");
  expect(argsOf(backend.calls, "shutdown_complete")).toEqual([
    {
      day: "2026-11-16",
      answers: { wentWell: "Shipped it", toImprove: null, outsideControl: null },
    },
  ]);
  expect(heading()).toHaveTextContent("Shutdown complete.");
});

test("save_failure_rolls_back_line", async () => {
  await openShutdown({
    shutdown_complete: () => {
      throw "store";
    },
  });
  await press("Continue");
  await press("Continue");
  fireEvent.change(screen.getByLabelText("What went well?"), { target: { value: "Kept" } });
  await press("Continue");
  expect(heading()).toHaveTextContent("Reflect");
  expect(screen.getByText("Orasenda can't save your reflection right now.")).toBeInTheDocument();
  // The words stay for another try.
  expect(screen.getByLabelText("What went well?")).toHaveValue("Kept");
});

test("an_earlier_day_says_so", async () => {
  await openShutdown({
    shutdown_complete: () => {
      throw "period";
    },
  });
  await press("Continue");
  await press("Continue");
  await press("Continue");
  expect(
    screen.getByText("This review is for an earlier day. Open Review again to see today."),
  ).toBeInTheDocument();
});

test("a_failed_load_offers_try_again", async () => {
  let calls = 0;
  await openShutdown({
    shutdown_get: () => {
      calls += 1;
      if (calls === 1) throw "store";
      return TWO;
    },
  });
  expect(screen.getByText(/Orasenda can't load your shutdown right now/)).toBeInTheDocument();
  await press(/^Try again/);
  expect(heading()).toHaveTextContent("Unfinished tasks");
});
