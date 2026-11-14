import { argsOf, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { card, renderRoutines, within } from "./RoutinesPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const dialog = (name: string) => screen.getByRole("dialog", { name });
const field = (name: string, label: string) => within(dialog(name)).getByLabelText(label);
const type = (name: string, label: string, value: string) =>
  fireEvent.change(field(name, label), { target: { value } });

async function choose(trigger: string, item: string) {
  fireEvent.click(screen.getByRole("button", { name: trigger }));
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
  await settle();
}

const LABELS = ["Name", "When", "Where", "After", "2-minute version", "Identity"];

test("new_habit_on_its_own_sends_every_field_and_its_days", async () => {
  const { backend } = await renderRoutines();
  await choose("Add", "New habit");
  const d = "New habit";
  expect(LABELS.map((label) => field(d, label).getAttribute("maxlength"))).toEqual([
    "80",
    "80",
    "80",
    "120",
    "120",
    "120",
  ]);
  expect(within(dialog(d)).getByRole("radio", { name: "On its own" })).toBeChecked();
  type(d, "Name", "Read");
  type(d, "When", "after lunch");
  type(d, "Where", "on the sofa");
  type(d, "After", "I eat lunch");
  type(d, "2-minute version", "one page");
  type(d, "Identity", "I am a reader");
  fireEvent.click(within(dialog(d)).getByRole("checkbox", { name: /Optional/ }));
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Sunday" }));
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add habit" }));
  await settle();
  expect(argsOf(backend.calls, "habit_create")).toEqual([
    {
      routineId: null,
      draft: {
        name: "Read",
        whenText: "after lunch",
        whereText: "on the sofa",
        anchor: "I eat lunch",
        twoMinute: "one page",
        identity: "I am a reader",
        optional: true,
        days: 63,
      },
    },
  ]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a_habit_in_a_routine_has_no_days_of_its_own", async () => {
  const { backend } = await renderRoutines();
  await choose("Add", "New habit");
  const d = "New habit";
  fireEvent.click(within(dialog(d)).getByRole("radio", { name: "Morning Light & Movement" }));
  expect(within(dialog(d)).queryByRole("group", { name: "Repeat on" })).toBeNull();
  type(d, "Name", "Stretch");
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add habit" }));
  await settle();
  expect(argsOf(backend.calls, "habit_create")).toEqual([
    {
      routineId: "routine-1",
      draft: {
        name: "Stretch",
        whenText: null,
        whereText: null,
        anchor: null,
        twoMinute: null,
        identity: null,
        optional: false,
        days: null,
      },
    },
  ]);
});

test("add_a_step_from_a_routines_more_menu_puts_it_in_that_routine", async () => {
  const { backend } = await renderRoutines();
  await choose("More for Morning Light & Movement", "Add a step");
  const d = "New step";
  expect(within(dialog(d)).getByRole("radio", { name: "Morning Light & Movement" })).toBeChecked();
  type(d, "Name", "Open the blinds");
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add step" }));
  await settle();
  expect(argsOf(backend.calls, "habit_create")).toMatchObject([{ routineId: "routine-1" }]);
});

test("edit_a_standalone_habit_fills_in_its_fields_and_saves_through_habit_update", async () => {
  const { backend } = await renderRoutines();
  await choose("More for Stretch", "Edit");
  const d = "Edit habit";
  expect(field(d, "Name")).toHaveValue("Stretch");
  expect(within(dialog(d)).queryByRole("radiogroup")).toBeNull();
  expect(within(dialog(d)).queryByRole("group", { name: "Belongs to" })).toBeNull();
  // Rust's sentence for the saved habit.
  expect(within(dialog(d)).getByText("I will stretch.")).toBeInTheDocument();
  expect(within(dialog(d)).getByRole("button", { name: "Monday" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  type(d, "When", "at 8:00");
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Save" }));
  await settle();
  expect(argsOf(backend.calls, "habit_update")).toEqual([
    {
      id: "habit-solo",
      draft: {
        name: "Stretch",
        whenText: "at 8:00",
        whereText: null,
        anchor: null,
        twoMinute: null,
        identity: null,
        optional: false,
        days: 127,
      },
    },
  ]);
});

test("edit_a_step_from_its_own_more_menu", async () => {
  const { backend } = await renderRoutines();
  const steps = within(card("Morning Light & Movement")).getByRole("list", { name: "Steps" });
  fireEvent.click(within(steps).getByRole("button", { name: "More for Drink a glass of water" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
  await settle();
  const d = "Edit step";
  expect(field(d, "After")).toHaveValue("I wake up");
  expect(field(d, "2-minute version")).toHaveValue("one sip");
  expect(within(dialog(d)).queryByRole("group", { name: "Repeat on" })).toBeNull();
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Save" }));
  await settle();
  expect(argsOf(backend.calls, "habit_update")).toMatchObject([
    { id: "habit-1", draft: { anchor: "I wake up", twoMinute: "one sip", days: null } },
  ]);
});

test("too_long_from_rust_shows_under_the_field_over_its_limit", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderRoutines({
    habit_update: () => {
      throw "tooLong";
    },
  });
  await choose("More for Stretch", "Edit");
  const d = "Edit habit";
  // A paste can pass the field's cap in some engines; Rust's refusal still lands on the field.
  type(d, "Where", "x".repeat(81));
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Save" }));
  await settle();
  expect(field(d, "Where")).toHaveAttribute("aria-invalid", "true");
  expect(field(d, "Where")).toHaveAccessibleDescription(/At most 80 characters\./);
  expect(field(d, "Where")).toHaveFocus();
  expect(field(d, "Name")).not.toHaveAttribute("aria-invalid", "true");
});

test("a_full_list_and_an_empty_name_are_said_kindly", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let answer = "full";
  await renderRoutines({
    habit_create: () => {
      throw answer;
    },
  });
  await choose("Add", "New habit");
  const d = "New habit";
  type(d, "Name", "Read");
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add habit" }));
  await settle();
  expect(within(dialog(d)).getByRole("status")).toHaveTextContent(
    "You have 30 habits on their own, the most Orasenda keeps. Remove one to add another.",
  );
  answer = "empty";
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add habit" }));
  await settle();
  expect(field(d, "Name")).toHaveAccessibleDescription(/Give it a name\./);
});

test("a_new_step_moved_to_its_own_is_worded_as_a_habit", async () => {
  await renderRoutines();
  await choose("More for Morning Light & Movement", "Add a step");
  fireEvent.click(within(dialog("New step")).getByRole("radio", { name: "On its own" }));
  const d = "New habit";
  expect(within(dialog(d)).getByRole("group", { name: "Repeat on" })).toBeInTheDocument();
  expect(within(dialog(d)).getByRole("button", { name: "Add habit" })).toBeInTheDocument();
});

test("a_routine_removed_while_adding_puts_the_habit_on_its_own", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderRoutines({
    habit_create: () => {
      throw "notFound";
    },
  });
  await choose("More for Morning Light & Movement", "Add a step");
  const d = "New step";
  type(d, "Name", "Open the blinds");
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add step" }));
  await settle();
  const now = "New habit";
  expect(within(dialog(now)).getByRole("status")).toHaveTextContent(
    "That routine was removed. Choose where this habit belongs again.",
  );
  expect(within(dialog(now)).getByRole("radio", { name: "On its own" })).toBeChecked();
  expect(within(dialog(now)).getByRole("group", { name: "Repeat on" })).toBeInTheDocument();
  expect(field(now, "Name")).toHaveValue("Open the blinds");
});

test("a_habit_edited_while_its_step_is_removed_or_a_routine_runs_says_so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let answer = "running";
  await renderRoutines({
    habit_update: () => {
      throw answer;
    },
  });
  const steps = within(card("Morning Light & Movement")).getByRole("list", { name: "Steps" });
  fireEvent.click(within(steps).getByRole("button", { name: "More for Drink a glass of water" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
  await settle();
  const d = "Edit step";
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Save" }));
  await settle();
  expect(within(dialog(d)).getByRole("status")).toHaveTextContent(
    "A routine is running. Save this when it ends.",
  );
  answer = "notFound";
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Save" }));
  await settle();
  expect(within(dialog(d)).getByRole("status")).toHaveTextContent(
    "This step was removed, so the change wasn't saved.",
  );
});

test("a_field_error_is_drawn_before_focus_lands_on_the_field", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderRoutines({
    habit_create: () => {
      throw "empty";
    },
  });
  await choose("Add", "New habit");
  const d = "New habit";
  const name = field(d, "Name") as HTMLInputElement;
  const heard: string[] = [];
  // What VoiceOver reads on focus: the field's description at that moment.
  name.addEventListener("focus", () => {
    const ids = name.getAttribute("aria-describedby")?.split(" ") ?? [];
    heard.push(ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
  });
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add habit" }));
  await settle();
  expect(name).toHaveFocus();
  expect(heard).toHaveLength(1);
  expect(heard[0]).toContain("Give it a name.");
});
