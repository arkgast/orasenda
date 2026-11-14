import { events } from "@shared/ipc/bindings";
import { argsOf, NO_ROUTINES, routinesView, routineView, settle } from "@shared/test/fixtures";
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

const dialog = (name: string) => screen.getByRole("dialog", { name });
const field = (name: string, label: string) => within(dialog(name)).getByLabelText(label);
const day = (name: string, weekday: string) =>
  within(dialog(name)).getByRole("button", { name: weekday });

async function openNew() {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "New routine" }));
  await settle();
}

async function openEdit(name = "Morning Light & Movement") {
  fireEvent.click(within(card(name)).getByRole("button", { name: `More for ${name}` }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
  await settle();
}

test("new_routine_saves_its_name_time_and_days_through_routine_create", async () => {
  const { backend } = await renderRoutines();
  await openNew();
  const d = "New routine";
  expect(field(d, "Name")).toHaveAttribute("maxlength", "80");
  // A new routine starts at any time, every day.
  expect(within(dialog(d)).getByRole("checkbox", { name: "Any time" })).toBeChecked();
  expect(field(d, "Time")).toBeDisabled();
  expect(within(dialog(d)).getByRole("group", { name: "Repeat on" })).toBeInTheDocument();
  fireEvent.change(field(d, "Name"), { target: { value: "Evening walk" } });
  fireEvent.click(within(dialog(d)).getByRole("checkbox", { name: "Any time" }));
  fireEvent.change(field(d, "Time"), { target: { value: "18:30" } });
  fireEvent.click(day(d, "Saturday"));
  fireEvent.click(day(d, "Sunday"));
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(argsOf(backend.calls, "routine_create")).toEqual([
    { draft: { name: "Evening walk", timeOfDay: 1110, days: 31 } },
  ]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("make_your_own_opens_the_routine_editor", async () => {
  const { backend } = await renderRoutines({ routines_list: () => NO_ROUTINES });
  fireEvent.click(screen.getByRole("button", { name: "Make your own" }));
  await settle();
  fireEvent.change(field("New routine", "Name"), { target: { value: "Reading" } });
  fireEvent.click(within(dialog("New routine")).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(argsOf(backend.calls, "routine_create")).toEqual([
    { draft: { name: "Reading", timeOfDay: null, days: 127 } },
  ]);
});

test("edit_fills_in_the_routine_and_saves_through_routine_update", async () => {
  const { backend } = await renderRoutines();
  await openEdit();
  const d = "Edit routine";
  expect(field(d, "Name")).toHaveValue("Morning Light & Movement");
  expect(within(dialog(d)).getByRole("checkbox", { name: "Any time" })).not.toBeChecked();
  expect(field(d, "Time")).toHaveValue("07:00");
  expect(day(d, "Monday")).toHaveAttribute("aria-pressed", "true");
  // Rust's words for the saved days are the helper line.
  expect(within(dialog(d)).getByText("Every day")).toBeInTheDocument();
  fireEvent.change(field(d, "Name"), { target: { value: "Morning light" } });
  fireEvent.click(within(dialog(d)).getByRole("checkbox", { name: "Any time" }));
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Save" }));
  await settle();
  expect(argsOf(backend.calls, "routine_update")).toEqual([
    { id: "routine-1", draft: { name: "Morning light", timeOfDay: null, days: 127 } },
  ]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("an_empty_name_from_rust_shows_under_the_name_and_keeps_the_dialog", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderRoutines({
    routine_create: () => {
      throw "empty";
    },
  });
  await openNew();
  const d = "New routine";
  fireEvent.change(field(d, "Name"), { target: { value: "   " } });
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add routine" }));
  await settle();
  const name = field(d, "Name");
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(name).toHaveAccessibleDescription(/Give it a name\./);
  expect(name).toHaveValue("   ");
  expect(name).toHaveFocus();
  expect(within(dialog(d)).getByRole("status")).toHaveTextContent("Not saved yet. Check the name.");
});

test("a_time_is_asked_for_when_any_time_is_off_and_nothing_is_sent", async () => {
  const { backend } = await renderRoutines();
  await openNew();
  const d = "New routine";
  fireEvent.change(field(d, "Name"), { target: { value: "Walk" } });
  fireEvent.click(within(dialog(d)).getByRole("checkbox", { name: "Any time" }));
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(field(d, "Time")).toHaveAccessibleDescription(/Pick a time, or choose Any time\./);
  expect(field(d, "Time")).toHaveFocus();
  expect(argsOf(backend.calls, "routine_create")).toEqual([]);
});

test("full_and_store_failures_are_said_in_the_dialog_and_keep_what_was_typed", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let answer = "full";
  await renderRoutines({
    routine_create: () => {
      throw answer;
    },
  });
  await openNew();
  const d = "New routine";
  fireEvent.change(field(d, "Name"), { target: { value: "Walk" } });
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(within(dialog(d)).getByRole("status")).toHaveTextContent(
    "You have 30 routines, the most Orasenda keeps. Remove one to add another.",
  );
  answer = "store";
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(within(dialog(d)).getByRole("status")).toHaveTextContent(
    "That change couldn't be saved. Your data is safe; try again in a moment.",
  );
  expect(field(d, "Name")).toHaveValue("Walk");
});

test("a_routine_removed_while_editing_says_so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderRoutines({
    routine_update: () => {
      throw "notFound";
    },
  });
  await openEdit();
  fireEvent.click(within(dialog("Edit routine")).getByRole("button", { name: "Save" }));
  await settle();
  expect(within(dialog("Edit routine")).getByRole("status")).toHaveTextContent(
    "This routine was removed, so the change wasn't saved.",
  );
});

test("opening_an_editor_clears_the_status_row_and_cancel_writes_nothing", async () => {
  const { backend, container } = await renderRoutines({
    routines_list: () => routinesView(),
  });
  await openEdit();
  fireEvent.click(within(dialog("Edit routine")).getByRole("button", { name: "Cancel" }));
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(argsOf(backend.calls, "routine_update")).toEqual([]);
  expect(statusText(container)).toBe("");
});

test("a_name_error_is_drawn_before_focus_lands_on_the_name", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderRoutines({
    routine_create: () => {
      throw "empty";
    },
  });
  await openNew();
  const d = "New routine";
  const name = field(d, "Name");
  const heard: string[] = [];
  name.addEventListener("focus", () => {
    const ids = name.getAttribute("aria-describedby")?.split(" ") ?? [];
    heard.push(ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
  });
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(name).toHaveFocus();
  expect(heard).toEqual([expect.stringContaining("Give it a name.")]);
});

test("saving_a_new_routine_moves_focus_to_its_more", async () => {
  await renderRoutines({
    routine_create: async () => {
      await events.routinesChanged.emit(
        routinesView({
          routines: [routineView(), routineView({ id: "routine-new", name: "Evening walk" })],
        }),
      );
      return "routine-new";
    },
  });
  await openNew();
  const d = "New routine";
  fireEvent.change(field(d, "Name"), { target: { value: "Evening walk" } });
  fireEvent.click(within(dialog(d)).getByRole("button", { name: "Add routine" }));
  await settle();
  // The dialog hands focus back after it closes (a zero-delay timer); the new item's More wins.
  await act(() => new Promise((done) => setTimeout(done, 20)));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    within(card("Evening walk")).getByRole("button", { name: "More for Evening walk" }),
  ).toHaveFocus();
});
