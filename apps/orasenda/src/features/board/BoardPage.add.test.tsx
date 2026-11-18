import { argsOf, BOARD, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderBoard } from "./BoardPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

const field = () => screen.getByRole("textbox", { name: "New task" });
const press = (key: string) => fireEvent.keyDown(field(), { key });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

test("add_task_by_keyboard", async () => {
  const backend = await renderBoard();
  fireEvent.keyDown(window, { key: "n", metaKey: true });
  expect(field()).toHaveFocus();
  type("Call the bank");
  press("Enter");
  await settle();
  expect(argsOf(backend.calls, "task_add")).toEqual([
    { draft: expect.objectContaining({ title: "Call the bank" }) },
  ]);
  // Enter keeps the field, empty and ready for the next one.
  expect(field()).toHaveFocus();
  expect(field()).toHaveValue("");
  press("Escape");
  expect(field()).not.toHaveFocus();
});

test("an empty title adds nothing", async () => {
  const backend = await renderBoard();
  fireEvent.keyDown(window, { key: "n", metaKey: true });
  type("   ");
  press("Enter");
  expect(argsOf(backend.calls, "task_add")).toEqual([]);
});

test("a task that did not save keeps the typed title and says so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderBoard({
    replies: {
      task_add: () => {
        throw new Error("store");
      },
    },
  });
  fireEvent.keyDown(window, { key: "n", metaKey: true });
  type("Call the bank");
  press("Enter");
  await settle();
  expect(field()).toHaveValue("Call the bank");
  expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
});

test("the Add task button focuses the field", async () => {
  await renderBoard();
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  expect(field()).toHaveFocus();
});

test("an empty board offers Add task and opens the field", async () => {
  await renderBoard({ board: BOARD });
  expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
  expect(
    screen.getByText("Add one, move a note from the Inbox, or import tasks."),
  ).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "n", metaKey: true });
  await settle();
  expect(field()).toHaveFocus();
});

test("add_task_has_plus_glyph_and_name", async () => {
  await renderBoard();
  const button = screen.getByRole("button", { name: "Add task" });
  expect(button.querySelector("svg")).not.toBeNull();
  expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});
