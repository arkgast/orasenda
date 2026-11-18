import {
  habitView,
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

const ADD = "Add a routine or habit";

test("overview_has_one_primary_add", async () => {
  const { container } = await renderRoutines();
  const primary = primaries(container);
  expect(primary).toHaveLength(1);
  expect(primary[0]).toBe(screen.getByRole("button", { name: ADD }));
  expect(primary[0]).toHaveTextContent("Add");
  expect(primary[0].querySelector("svg")).not.toBeNull();
  expect(primary[0]).toHaveAttribute("aria-haspopup", "menu");
});

test("no_add_primary_while_the_load_error_shows", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = await renderRoutines({
    routines_list: () => {
      throw "store";
    },
  });
  expect(primaries(container)).toHaveLength(0);
  expect(screen.queryByRole("button", { name: ADD })).toBeNull();
});

test("every_routine_start_is_quiet", async () => {
  const view = routinesView({
    routines: [
      routineView({ id: "r-a", name: "Done one" }, "finished"),
      routineView({ id: "r-b", name: "Fresh one", wellness: false, note: null }),
      routineView({ id: "r-c", name: "Half one", wellness: false, note: null }, "inProgress"),
    ],
  });
  await renderRoutines({ routines_list: () => view }, { onStart: vi.fn() });
  for (const name of ["Fresh one", "Half one"]) {
    expect(within(card(name)).getByRole("button", { name: `Start ${name}` })).toHaveAttribute(
      "data-variant",
      "quiet",
    );
  }
});

test("more_trigger_is_icon_named_for_item", async () => {
  const long = "L".repeat(120);
  await renderRoutines({
    routines_list: () =>
      routinesView({
        routines: [routineView({ name: long })],
        habits: [standaloneHabit()],
      }),
  });
  for (const name of [long, "Drink a glass of water", "Stretch"]) {
    const trigger = screen.getByRole("button", { name: `More actions for ${name}` });
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("");
  }
  expect(screen.queryAllByText("More")).toHaveLength(0);
});

test("add_menu_opens_with_three_items", async () => {
  await renderRoutines();
  const add = screen.getByRole("button", { name: ADD });
  fireEvent.click(add);
  expect(add).toHaveAttribute("aria-expanded", "true");
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((i) => i.textContent)).toEqual(["New routine", "From a template…", "New habit"]);
});

const stateOf = (name: string) =>
  within(card("Morning Light & Movement"))
    .getAllByRole("listitem")
    .find((li) => li.textContent?.includes(name)) as HTMLElement;

test("in_progress_routine_ticks_done_steps_and_leaves_others_hollow", async () => {
  await renderRoutines({
    routines_list: () => routinesView({ routines: [routineView({}, "inProgress")] }),
  });
  const done = stateOf("Drink a glass of water").querySelector("[data-slot=routine-item]");
  const open = stateOf("Move for 5").querySelector("[data-slot=routine-item]");
  expect(done).toHaveAttribute("data-state", "done");
  expect(open).not.toHaveAttribute("data-state", "done");
  expect(stateOf("Move for 5")).not.toHaveTextContent("Skipped");
});

test("finished_routine_ticks_done_steps_and_marks_others_skipped", async () => {
  const base = routineView({}, "finished");
  const view = routineView(
    {
      todayLine: "Done today, 1 of 2",
      habits: [base.habits[0], habitView({ ...base.habits[1], doneToday: false })],
    },
    "finished",
  );
  await renderRoutines({ routines_list: () => routinesView({ routines: [view] }) });
  expect(stateOf("Drink a glass of water")).not.toHaveTextContent("Skipped");
  expect(
    stateOf("Drink a glass of water").querySelector("[data-slot=routine-item]"),
  ).toHaveAttribute("data-state", "done");
  expect(stateOf("Move for 5")).toHaveTextContent("Skipped");
});
