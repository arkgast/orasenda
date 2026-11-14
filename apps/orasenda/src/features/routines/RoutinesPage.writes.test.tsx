import { events } from "@shared/ipc/bindings";
import {
  argsOf,
  deferred,
  emitRoutinesChanged,
  routinesView,
  settle,
  standaloneHabit,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { card, renderRoutines, statusText, within } from "./RoutinesPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const box = () => screen.getByRole("checkbox", { name: "Done today: Stretch" });

test("check_ins_are_chained_and_the_newest_intent_is_sent", async () => {
  const first = deferred<null>();
  let sent = 0;
  const { backend } = await renderRoutines({
    habit_check: () => {
      sent += 1;
      return sent === 1 ? first.promise : null;
    },
  });
  fireEvent.click(box()); // on: sent, held
  fireEvent.click(box()); // off: waits
  fireEvent.click(box()); // on: replaces the waiting off
  await settle();
  expect(argsOf(backend.calls, "habit_check")).toEqual([{ id: "habit-solo", done: true }]);
  expect(box()).toHaveAttribute("aria-checked", "true");
  await act(async () => first.resolve(null));
  await settle();
  expect(argsOf(backend.calls, "habit_check")).toEqual([
    { id: "habit-solo", done: true },
    { id: "habit-solo", done: true },
  ]);
});

test("a_failed_check_in_rolls_back_to_rusts_view_and_says_so", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = await renderRoutines({
    habit_check: () => {
      throw "store";
    },
  });
  fireEvent.click(box());
  await settle();
  expect(box()).toHaveAttribute("aria-checked", "false");
  expect(statusText(container)).toBe(
    "That change couldn't be saved. Your data is safe; try again in a moment.",
  );
  expect(error).toHaveBeenCalled();
});

test("an_ok_without_routines_changed_reads_the_list_again", async () => {
  let done = false;
  const { backend } = await renderRoutines({
    routines_list: () => routinesView({ habits: [standaloneHabit({ doneToday: done })] }),
    habit_check: () => {
      done = true;
      return null;
    },
  });
  fireEvent.click(box());
  await settle();
  expect(argsOf(backend.calls, "routines_list")).toHaveLength(2);
  expect(box()).toHaveAttribute("aria-checked", "true");
});

test("an_ok_that_brings_routines_changed_does_not_read_again", async () => {
  const { backend } = await renderRoutines({
    habit_check: async () => {
      await events.routinesChanged.emit(
        routinesView({ habits: [standaloneHabit({ doneToday: true })] }),
      );
      return null;
    },
  });
  fireEvent.click(box());
  await settle();
  expect(argsOf(backend.calls, "routines_list")).toHaveLength(1);
  expect(box()).toHaveAttribute("aria-checked", "true");
});

test("an_event_keeps_a_pending_check_in_until_it_answers", async () => {
  const held = deferred<null>();
  await renderRoutines({ habit_check: () => held.promise });
  fireEvent.click(box());
  await emitRoutinesChanged(routinesView());
  expect(box()).toHaveAttribute("aria-checked", "true");
  await act(async () => held.resolve(null));
  await emitRoutinesChanged(routinesView({ habits: [standaloneHabit({ doneToday: true })] }));
  expect(box()).toHaveAttribute("aria-checked", "true");
});

test("a_store_failure_shows_one_plain_line_and_try_again", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const { backend, container } = await renderRoutines({
    routines_list: () => {
      if (fail) throw "store";
      return routinesView();
    },
  });
  expect(statusText(container)).toContain(
    "Routines can't be read right now. Your data is safe; try again in a moment.",
  );
  expect(screen.queryByRole("article")).toBeNull();
  expect(screen.queryByText("No routines yet.")).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again reading your routines" }));
  await settle();
  expect(argsOf(backend.calls, "routines_list")).toHaveLength(2);
  expect(card("Morning Light & Movement")).toBeInTheDocument();
  expect(error).toHaveBeenCalled();
});

test("a_rejected_list_is_a_failure_too", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = await renderRoutines({
    routines_list: () => {
      throw new Error("not allowed");
    },
  });
  expect(statusText(container)).toContain("Routines can't be read right now.");
});

test("a_list_asked_before_an_event_never_overwrites_it", async () => {
  const held = deferred<unknown>();
  await renderRoutines({ routines_list: () => held.promise });
  await emitRoutinesChanged(routinesView({ habits: [standaloneHabit({ doneToday: true })] }));
  await act(async () => held.resolve(routinesView()));
  expect(box()).toHaveAttribute("aria-checked", "true");
});

test("move_down_and_up_call_routine_move_with_the_new_index", async () => {
  const two = routinesView({
    routines: [
      routinesView().routines[0],
      { ...routinesView().routines[0], id: "routine-2", name: "Wind-down" },
    ],
  });
  const { backend } = await renderRoutines({ routines_list: () => two });
  const more = within(card("Morning Light & Movement")).getByRole("button", {
    name: "More for Morning Light & Movement",
  });
  fireEvent.click(more);
  const menu = await screen.findByRole("menu");
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent),
  ).toEqual(["Edit", "Move up", "Move down", "Remove"]);
  expect(within(menu).getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Move down" }));
  await settle();
  expect(argsOf(backend.calls, "routine_move")).toEqual([{ id: "routine-1", toIndex: 1 }]);
});

test("habit_move_and_editors_from_the_habit_more_menu", async () => {
  const { backend, container } = await renderRoutines({
    routines_list: () =>
      routinesView({
        habits: [standaloneHabit(), standaloneHabit({ id: "habit-b", name: "Read" })],
      }),
  });
  fireEvent.click(screen.getByRole("button", { name: "More for Read" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Move up" }));
  await settle();
  expect(argsOf(backend.calls, "habit_move")).toEqual([{ id: "habit-b", toIndex: 0 }]);
  fireEvent.click(screen.getByRole("button", { name: "More for Read" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
  expect(statusText(container)).toBe("Editing habits comes in the next update.");
});

test("a_write_after_navigating_away_and_back_waits_for_the_one_still_in_flight", async () => {
  const first = deferred<null>();
  let sent = 0;
  const replies = {
    habit_check: () => {
      sent += 1;
      return sent === 1 ? first.promise : null;
    },
  };
  const { unmount } = await renderRoutines(replies);
  fireEvent.click(box()); // sent, held
  await settle();
  expect(sent).toBe(1);
  unmount();
  const { backend } = await renderRoutines(replies);
  fireEvent.click(box()); // the remounted page's write
  await settle();
  // Still one call: the new page's write waits for the old page's, one in flight across pages.
  expect(sent).toBe(1);
  await act(async () => first.resolve(null));
  await settle();
  expect(sent).toBe(2);
  expect(argsOf(backend.calls, "habit_check")).toHaveLength(1);
});
