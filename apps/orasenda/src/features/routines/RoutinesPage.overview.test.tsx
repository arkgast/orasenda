import {
  argsOf,
  emitRoutinesChanged,
  routinesView,
  routineView,
  settle,
  standaloneHabit,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { card, primaries, renderRoutines, within } from "./RoutinesPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

const SECOND = routineView({
  id: "routine-2",
  name: "Wind-down",
  time: "21:30",
  timeOfDay: 1290,
  wellness: false,
  note: null,
  habits: [],
});

test("overview_is_a_page_frame_titled_routines_with_one_card_per_routine", async () => {
  await renderRoutines({
    routines_list: () => routinesView({ routines: [routineView(), SECOND] }),
  });
  expect(screen.getByRole("heading", { level: 1, name: "Routines" })).toBeInTheDocument();
  const morning = card("Morning Light & Movement");
  expect(within(morning).getByText("07:00 · Every day")).toBeInTheDocument();
  expect(within(morning).getByText("Not started today")).toBeInTheDocument();
  expect(card("Wind-down")).toBeInTheDocument();
});

test("steps_are_read_only_routine_items_in_a_list", async () => {
  await renderRoutines();
  const morning = card("Morning Light & Movement");
  const steps = within(morning).getByRole("list", { name: "Steps" });
  const items = within(steps).getAllByRole("listitem");
  expect(
    items.map((li) => li.querySelector("[data-slot=routine-item-label]")?.textContent),
  ).toEqual(["Drink a glass of water", "Move for 5–10 minutes"]);
  expect(within(steps).queryByRole("checkbox")).toBeNull();
  expect(items[0]).toHaveTextContent("After I wake up, I will drink a glass of water.");
});

test("templated_routine_shows_its_wellness_note_and_others_do_not", async () => {
  await renderRoutines({
    routines_list: () => routinesView({ routines: [routineView(), SECOND] }),
  });
  expect(within(card("Morning Light & Movement")).getByRole("note")).toHaveTextContent(
    "Wellness suggestion, not medical advice. Inspired by Huberman Lab; some steps have limited evidence.",
  );
  expect(within(card("Wind-down")).queryByRole("note")).toBeNull();
});

test("show_the_record_expands_week_dot_grids_with_one_legend_on_the_page", async () => {
  const { container } = await renderRoutines();
  const morning = card("Morning Light & Movement");
  const toggle = within(morning).getByRole("button", { name: "Show the record" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // The standalone habit's grid is always shown, and carries the legend while no record is open.
  expect(container.querySelectorAll("[data-slot=habit-legend]")).toHaveLength(1);
  fireEvent.click(toggle);
  expect(within(morning).getByRole("button", { name: "Hide the record" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const grids = within(morning).getAllByRole("group", { name: /daily record/ });
  expect(grids.map((g) => g.getAttribute("aria-label"))).toEqual([
    "Drink a glass of water, daily record",
    "Move for 5–10 minutes, daily record",
  ]);
  expect(grids[0]).toHaveAttribute("data-columns", "week");
  expect(within(morning).getAllByText("4 days kept")).toHaveLength(2);
  expect(container.querySelectorAll("[data-slot=habit-legend]")).toHaveLength(1);
  expect(
    within(grids[0] as HTMLElement).getByRole("img", {
      name: "Saturday 7 November, Today, Upcoming",
    }),
  ).toBeInTheDocument();
});

test("dots_start_in_their_weekday_column_and_speak_kind_words", async () => {
  await renderRoutines();
  const habits = screen.getByRole("region", { name: "Habits" });
  // Wednesday 4 November is the first day: two empty cells (Monday, Tuesday) come before it.
  expect(habits.querySelectorAll("[data-slot=habit-gap]")).toHaveLength(2);
  expect(
    within(habits).getByRole("img", { name: "Thursday 5 November, Not done" }),
  ).toBeInTheDocument();
  expect(within(habits).getByText("Two days off. Today is a fresh start.")).toBeInTheDocument();
});

test("habits_section_has_a_done_today_checkbox_per_habit", async () => {
  const { backend } = await renderRoutines();
  const habits = screen.getByRole("region", { name: "Habits" });
  const stretch = within(habits).getByRole("article", { name: "Stretch" });
  expect(within(stretch).getByText("Every day")).toBeInTheDocument();
  const box = within(stretch).getByRole("checkbox", { name: "Done today: Stretch" });
  expect(box).toHaveAttribute("aria-checked", "false");
  fireEvent.click(box);
  expect(box).toHaveAttribute("aria-checked", "true");
  await settle();
  expect(argsOf(backend.calls, "habit_check")).toEqual([{ id: "habit-solo", done: true }]);
});

test("the_page_follows_routines_changed", async () => {
  await renderRoutines();
  await emitRoutinesChanged(
    routinesView({
      routines: [routineView({}, "finished")],
      habits: [standaloneHabit({ doneToday: true })],
    }),
  );
  expect(
    within(card("Morning Light & Movement")).getByText("Done today, 2 of 2"),
  ).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Done today: Stretch" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("an_optional_habit_says_so_by_its_name_not_on_its_check_in", async () => {
  await renderRoutines({
    routines_list: () => routinesView({ habits: [standaloneHabit({ optional: true })] }),
  });
  const habit = screen.getByRole("article", { name: "Stretch" });
  const check = within(habit).getByRole("checkbox", { name: "Done today: Stretch" });
  expect(check).not.toHaveTextContent("Optional");
  const name = within(habit).getByRole("heading", { level: 3, name: "Stretch" }).parentElement;
  expect(name).toHaveTextContent("Optional");
});
