import { events } from "@shared/ipc/bindings";
import { argsOf, routinesView, settle, standaloneHabit } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { card, renderRoutines, statusText, within } from "./RoutinesPage.support";
import { UNDO_MS } from "./useUndoRemove";

afterEach(async () => {
  vi.useRealTimers();
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const ROUTINE = "Morning Light & Movement";

async function choose(trigger: string, item: string) {
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  await settle();
  // Not findBy: it polls with timers, which one test fakes.
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
  await settle();
}

/** Rust's answer to a remove: the event without the routine. */
const withoutRoutine = () => routinesView({ routines: [] });

test("remove_shows_removed_with_undo_and_moves_focus_to_undo", async () => {
  const { backend, container } = await renderRoutines({
    routine_remove: async () => {
      await events.routinesChanged.emit(withoutRoutine());
      return null;
    },
  });
  await choose(`More actions for ${ROUTINE}`, "Remove");
  expect(argsOf(backend.calls, "routine_remove")).toEqual([{ id: "routine-1" }]);
  expect(screen.queryByRole("article", { name: ROUTINE })).toBeNull();
  expect(statusText(container)).toContain(`Removed ${ROUTINE}.`);
  const undo = screen.getByRole("button", { name: `Undo removing ${ROUTINE}` });
  expect(undo).toHaveTextContent("Undo");
  expect(undo).toHaveFocus();
});

test("undo_restores_and_brings_focus_back_to_the_item", async () => {
  const { backend, container } = await renderRoutines({
    routine_remove: async () => {
      await events.routinesChanged.emit(withoutRoutine());
      return null;
    },
    routine_restore: async () => {
      await events.routinesChanged.emit(routinesView());
      return null;
    },
  });
  await choose(`More actions for ${ROUTINE}`, "Remove");
  fireEvent.click(screen.getByRole("button", { name: `Undo removing ${ROUTINE}` }));
  await settle();
  expect(argsOf(backend.calls, "routine_restore")).toEqual([{ id: "routine-1" }]);
  expect(statusText(container)).toBe(`Brought back ${ROUTINE}.`);
  expect(
    within(card(ROUTINE)).getByRole("button", { name: `More actions for ${ROUTINE}` }),
  ).toHaveFocus();
});

test("the_removed_row_leaves_after_ten_seconds", async () => {
  const { container } = await renderRoutines();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await choose("More actions for Stretch", "Remove");
  expect(statusText(container)).toContain("Removed Stretch.");
  // Focus has moved on from Undo, so nothing holds the row.
  act(() => screen.getByRole("button", { name: "Add a routine or habit" }).focus());
  await act(async () => vi.advanceTimersByTime(UNDO_MS - 1));
  expect(statusText(container)).toContain("Removed Stretch.");
  await act(async () => vi.advanceTimersByTime(1));
  expect(statusText(container)).toBe("");
});

test("the_removed_row_stays_while_undo_has_focus_and_leaves_ten_seconds_after_focus_moves", async () => {
  const { container } = await renderRoutines();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await choose("More actions for Stretch", "Remove");
  const undo = screen.getByRole("button", { name: "Undo removing Stretch" });
  expect(undo).toHaveFocus();
  await act(async () => vi.advanceTimersByTime(UNDO_MS * 3));
  // A keyboard or VoiceOver user keeps their place: Undo is still there and still focused.
  expect(statusText(container)).toContain("Removed Stretch.");
  expect(undo).toHaveFocus();
  const add = screen.getByRole("button", { name: "Add a routine or habit" });
  act(() => add.focus());
  await act(async () => vi.advanceTimersByTime(UNDO_MS - 1));
  expect(statusText(container)).toContain("Removed Stretch.");
  await act(async () => vi.advanceTimersByTime(1));
  expect(statusText(container)).toBe("");
  expect(add).toHaveFocus();
});

test("the_next_action_replaces_the_removed_row", async () => {
  const { container } = await renderRoutines({
    routines_list: () =>
      routinesView({ habits: [standaloneHabit(), standaloneHabit({ id: "h2", name: "Read" })] }),
  });
  await choose("More actions for Stretch", "Remove");
  expect(statusText(container)).toContain("Removed Stretch.");
  fireEvent.click(screen.getByRole("checkbox", { name: "Done today: Read" }));
  expect(statusText(container)).toBe("");
});

test("a_step_comes_back_only_with_its_routine", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { backend, container } = await renderRoutines({
    habit_restore: () => {
      throw "notFound";
    },
  });
  const steps = within(card(ROUTINE)).getByRole("list", { name: "Steps" });
  fireEvent.click(
    within(steps).getByRole("button", { name: "More actions for Drink a glass of water" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
  await settle();
  expect(argsOf(backend.calls, "habit_remove")).toEqual([{ id: "habit-1" }]);
  fireEvent.click(screen.getByRole("button", { name: "Undo removing Drink a glass of water" }));
  await settle();
  expect(statusText(container)).toBe(
    `Drink a glass of water comes back only with its routine, and ${ROUTINE} was removed.`,
  );
});

test("a_full_list_on_undo_is_said_plainly", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = await renderRoutines({
    routine_restore: () => {
      throw "full";
    },
  });
  await choose(`More actions for ${ROUTINE}`, "Remove");
  fireEvent.click(screen.getByRole("button", { name: `Undo removing ${ROUTINE}` }));
  await settle();
  expect(statusText(container)).toBe(
    "You have 30 routines, the most Orasenda keeps. Remove one to bring this one back.",
  );
});

test("a_failed_remove_says_so_and_offers_try_again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const { backend, container } = await renderRoutines({
    habit_remove: () => {
      if (fail) throw "store";
      return null;
    },
  });
  await choose("More actions for Stretch", "Remove");
  expect(statusText(container)).toContain(
    "Stretch wasn't removed. Your data is safe; try again in a moment.",
  );
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again removing Stretch" }));
  await settle();
  expect(argsOf(backend.calls, "habit_remove")).toHaveLength(2);
  expect(statusText(container)).toContain("Removed Stretch.");
});

test("a_failed_undo_offers_try_again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const { backend, container } = await renderRoutines({
    habit_restore: () => {
      if (fail) throw "store";
      return null;
    },
  });
  await choose("More actions for Stretch", "Remove");
  fireEvent.click(screen.getByRole("button", { name: "Undo removing Stretch" }));
  await settle();
  expect(statusText(container)).toContain(
    "Stretch couldn't be brought back. Your data is safe; try again in a moment.",
  );
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again bringing back Stretch" }));
  await settle();
  expect(argsOf(backend.calls, "habit_restore")).toHaveLength(2);
  expect(statusText(container)).toBe("Brought back Stretch.");
});
