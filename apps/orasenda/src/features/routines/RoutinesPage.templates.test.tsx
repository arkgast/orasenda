import {
  argsOf,
  deferred,
  NO_ROUTINES,
  routinesView,
  settle,
  TEMPLATES,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { primaries, renderRoutines, statusText, within } from "./RoutinesPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const dialog = () => screen.getByRole("dialog", { name: "Start from a template" });
const line = () => within(dialog()).getByRole("status");

test("empty_state_offers_a_template_first_and_making_your_own", async () => {
  const { container } = await renderRoutines({ routines_list: () => NO_ROUTINES });
  expect(screen.getByRole("heading", { level: 2, name: "No routines yet." })).toBeInTheDocument();
  expect(
    screen.getByText("Routines are small steps you take at the same time each day."),
  ).toBeInTheDocument();
  const primary = primaries(container);
  expect(primary).toHaveLength(1);
  expect(primary[0]).toHaveTextContent("Start from a template");
  expect(screen.getByRole("button", { name: "Make your own" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
});

test("make_your_own_says_the_editor_comes_next_rather_than_doing_nothing", async () => {
  const { container } = await renderRoutines({ routines_list: () => NO_ROUTINES });
  fireEvent.click(screen.getByRole("button", { name: "Make your own" }));
  expect(statusText(container)).toBe("Making your own routine comes in the next update.");
});

test("template_dialog_lists_the_five_templates_with_steps_and_the_wellness_note", async () => {
  const { backend } = await renderRoutines({ routines_list: () => NO_ROUTINES });
  fireEvent.click(screen.getByRole("button", { name: "Start from a template" }));
  await settle();
  expect(argsOf(backend.calls, "routine_templates")).toHaveLength(1);
  expect(within(dialog()).getAllByRole("radio")).toHaveLength(5);
  expect(within(dialog()).getByRole("radio", { name: /Morning Light & Movement/ })).toBeChecked();
  const steps = within(dialog()).getByRole("list", { name: "Steps in Morning Light & Movement" });
  expect(within(steps).getAllByRole("listitem")).toHaveLength(7);
  expect(within(dialog()).getByRole("note")).toHaveTextContent(TEMPLATES[0].note);
  fireEvent.click(within(dialog()).getByRole("radio", { name: /Wind-down/ }));
  expect(
    within(within(dialog()).getByRole("list", { name: "Steps in Wind-down" })).getAllByRole(
      "listitem",
    ),
  ).toHaveLength(2);
});

test("adding_a_template_calls_routine_add_template_and_closes", async () => {
  const { backend } = await renderRoutines({ routines_list: () => NO_ROUTINES });
  fireEvent.click(screen.getByRole("button", { name: "Start from a template" }));
  await settle();
  fireEvent.click(within(dialog()).getByRole("radio", { name: /Study Session/ }));
  fireEvent.click(within(dialog()).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(argsOf(backend.calls, "routine_add_template")).toEqual([{ template: "studySession" }]);
  expect(screen.queryByRole("dialog")).toBeNull();
  // No routines-changed came with the answer, so the page reads the list again.
  expect(argsOf(backend.calls, "routines_list")).toHaveLength(2);
});

test("a_refused_add_keeps_the_dialog_open_with_a_plain_line", async () => {
  await renderRoutines({
    routines_list: () => routinesView(),
    routine_add_template: () => {
      throw "full";
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /From a template/ }));
  await settle();
  // The live line is in place, empty, before anything fails, so VoiceOver hears the text arrive.
  const before = line();
  expect(before).toHaveTextContent(/^$/);
  fireEvent.click(within(dialog()).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(line()).toBe(before);
  expect(before).toHaveTextContent(
    "You have 30 routines, the most Orasenda keeps. Remove one to add another.",
  );
});

test("an_add_that_cannot_reach_rust_is_said_in_the_same_live_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const held = deferred<unknown>();
  await renderRoutines({
    routines_list: () => NO_ROUTINES,
    routine_templates: () => held.promise,
    routine_add_template: () => {
      throw new Error("ipc down");
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start from a template" }));
  const before = line();
  await act(async () => held.resolve(TEMPLATES));
  fireEvent.click(within(dialog()).getByRole("button", { name: "Add routine" }));
  await settle();
  expect(line()).toBe(before);
  expect(before).toHaveTextContent(
    "Couldn't add the routine. Your data is safe; try again in a moment.",
  );
});

test("templates_that_cannot_be_read_say_so_and_can_be_asked_again", async () => {
  let fail = true;
  const { backend } = await renderRoutines({
    routines_list: () => NO_ROUTINES,
    routine_templates: () => {
      if (fail) throw "store";
      return TEMPLATES;
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Start from a template" }));
  await settle();
  expect(line()).toHaveTextContent("Templates can't be read right now. Try again in a moment.");
  fail = false;
  fireEvent.click(within(dialog()).getByRole("button", { name: "Try again" }));
  await settle();
  expect(argsOf(backend.calls, "routine_templates")).toHaveLength(2);
  expect(within(dialog()).getAllByRole("radio")).toHaveLength(5);
});

test("an_empty_template_list_reads_as_a_failure_and_can_be_asked_again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let empty = true;
  const { backend } = await renderRoutines({
    routines_list: () => NO_ROUTINES,
    routine_templates: () => (empty ? [] : TEMPLATES),
  });
  fireEvent.click(screen.getByRole("button", { name: "Start from a template" }));
  await settle();
  expect(line()).toHaveTextContent("Templates can't be read right now. Try again in a moment.");
  empty = false;
  fireEvent.click(within(dialog()).getByRole("button", { name: "Try again" }));
  await settle();
  expect(argsOf(backend.calls, "routine_templates")).toHaveLength(2);
  expect(within(dialog()).getAllByRole("radio")).toHaveLength(5);
  expect(line()).toHaveTextContent(/^$/);
});

test("add_menu_offers_new_routine_a_template_and_new_habit", async () => {
  await renderRoutines();
  const add = screen.getByRole("button", { name: "Add" });
  expect(add).toHaveAttribute("aria-haspopup", "menu");
  fireEvent.click(add);
  const menu = await screen.findByRole("menu");
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent),
  ).toEqual(["New routine", "From a template…", "New habit"]);
});

test("cancel_closes_the_dialog_without_writing", async () => {
  const held = deferred<unknown>();
  const { backend } = await renderRoutines({
    routines_list: () => NO_ROUTINES,
    routine_templates: () => held.promise,
  });
  fireEvent.click(screen.getByRole("button", { name: "Start from a template" }));
  await act(async () => held.resolve(TEMPLATES));
  fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(argsOf(backend.calls, "routine_add_template")).toEqual([]);
});
