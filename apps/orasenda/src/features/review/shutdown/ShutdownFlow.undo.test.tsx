import { argsOf, settle, shutdownView } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { openShutdown, press } from "./ShutdownFlow.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.useRealTimers();
});

const toast = () => document.querySelector('[data-slot="toast"]');

async function moveOne(replies = {}) {
  const shown = await openShutdown(replies);
  await press("Back to Backlog Write notes");
  await press("Continue");
  return shown;
}

test("toast_stays_until_dismissed", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await moveOne();
  expect(toast()).toHaveTextContent("Moved 2 tasks to Backlog.");
  // It follows toast.md: it has an action, so no timer closes it, hovered or not.
  await act(async () => {
    vi.advanceTimersByTime(60_000);
  });
  expect(toast()).not.toBeNull();
  // It rides along to the next steps.
  await press("Continue");
  expect(toast()).not.toBeNull();
  await press("Dismiss");
  expect(toast()).toBeNull();
});

test("toast_has_undo_and_dismiss_and_no_hover_pause", async () => {
  await moveOne();
  expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  fireEvent.mouseEnter(toast() as Element);
  fireEvent.focus(screen.getByRole("button", { name: "Undo" }));
  expect(toast()).not.toBeNull();
});

test("undo_sends_the_token_and_says_what_rust_says", async () => {
  const { backend } = await moveOne();
  await press("Undo");
  expect(argsOf(backend.calls, "shutdown_move_undo")).toEqual([{ token: "t1" }]);
  expect(toast()).toHaveTextContent("Put 2 tasks back.");
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});

test("undo_expired_line", async () => {
  await moveOne({
    shutdown_move_undo: () => {
      throw "notFound";
    },
  });
  await press("Undo");
  expect(toast()).toHaveTextContent("That can't be undone now.");
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});

test("a_failed_undo_can_be_tried_again", async () => {
  let calls = 0;
  await moveOne({
    shutdown_move_undo: () => {
      calls += 1;
      if (calls === 1) throw "store";
      return "Put 1 task back.";
    },
  });
  await press("Undo");
  expect(toast()).toHaveTextContent("Orasenda can't put those back right now.");
  await press("Undo");
  expect(toast()).toHaveTextContent("Put 1 task back.");
});

test("toast_closes_on_next_move_and_flow_end", async () => {
  // A flow only goes forward, so its one move is its toast; a toast never outlives its flow.
  const { unmount } = await moveOne();
  expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
  unmount();
  expect(toast()).toBeNull();
});

test("end_closes_the_flow_and_with_it_the_toast", async () => {
  const { onClose } = await moveOne();
  await press(/^End/);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("tomorrow_reads_again_after_a_move_and_after_undo", async () => {
  let reads = 0;
  const { backend } = await moveOne({
    shutdown_get: () => {
      reads += 1;
      return shutdownView({ tomorrow: [`Planned: ${reads} sessions`] });
    },
  });
  expect(argsOf(backend.calls, "shutdown_get")).toHaveLength(2);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tomorrow");
  expect(screen.getByText("Planned: 2 sessions")).toBeInTheDocument();
  await press("Undo");
  expect(screen.getByText("Planned: 3 sessions")).toBeInTheDocument();
});

test("a_failed_tomorrow_read_keeps_the_old_lines", async () => {
  let reads = 0;
  await moveOne({
    shutdown_get: () => {
      reads += 1;
      if (reads > 1) throw "store";
      return shutdownView({ tomorrow: ["Planned: 1 sessions"] });
    },
  });
  expect(screen.getByText("Planned: 1 sessions")).toBeInTheDocument();
});

test("focus_goes_to_dismiss_after_undo_and_to_the_heading_after_dismiss", async () => {
  await moveOne();
  await press("Undo");
  expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
  await press("Dismiss");
  expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
});

test("focus_goes_to_dismiss_when_undo_has_expired", async () => {
  await moveOne({
    shutdown_move_undo: () => {
      throw "notFound";
    },
  });
  await press("Undo");
  expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
});
