import { argsOf, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { card, pointer, renderBoard, stubPointerCapture, stubRects } from "./BoardPage.support";

beforeEach(() => {
  stubPointerCapture();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const plus = (name: string) => screen.getByRole("button", { name: `Add task to ${name}` });
const heading = (name: string) => screen.getByRole("heading", { name });
const fieldIn = (name: string) => screen.getByRole("textbox", { name: `New task in ${name}` });
const key = (target: Element, k: string) => fireEvent.keyDown(target, { key: k });

test("plus_opens_field_in_column", async () => {
  await renderBoard();
  fireEvent.click(plus("Today"));
  const field = fieldIn("Today");
  expect(field).toHaveFocus();
  // At the top of its own column, ahead of the cards.
  const today = screen.getByRole("region", { name: "Today" });
  expect(within(today).getByRole("textbox")).toBe(field);
  expect(screen.getByRole("textbox", { name: "New task" })).not.toBe(field);
});

test("plus_on_backlog_focuses_field", async () => {
  await renderBoard();
  fireEvent.click(plus("Backlog"));
  expect(screen.getByRole("textbox", { name: "New task" })).toHaveFocus();
  expect(screen.queryByRole("textbox", { name: "New task in Backlog" })).toBeNull();
});

test("no_plus_on_done", async () => {
  await renderBoard();
  fireEvent.click(screen.getByRole("button", { name: "Done, 1 task" }));
  expect(screen.getByRole("region", { name: "Done" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add task to Done" })).toBeNull();
  for (const name of ["Backlog", "Today", "Doing"]) expect(plus(name)).toBeInTheDocument();
});

test("one_new_task_field_at_a_time", async () => {
  await renderBoard();
  fireEvent.click(plus("Today"));
  fireEvent.click(plus("Doing"));
  expect(screen.queryByRole("textbox", { name: "New task in Today" })).toBeNull();
  expect(fieldIn("Doing")).toHaveFocus();
});

test("field_adds_at_end_of_column", async () => {
  const backend = await renderBoard();
  fireEvent.click(plus("Today"));
  const field = fieldIn("Today");
  fireEvent.change(field, { target: { value: "Call the bank" } });
  key(field, "Enter");
  await settle();
  expect(argsOf(backend.calls, "task_add")).toEqual([
    { draft: expect.objectContaining({ title: "Call the bank", lane: "today" }) },
  ]);
  // The field stays, empty and ready.
  expect(fieldIn("Today")).toHaveFocus();
  expect(fieldIn("Today")).toHaveValue("");
  key(fieldIn("Today"), "Escape");
  expect(screen.queryByRole("textbox", { name: "New task in Today" })).toBeNull();
  expect(plus("Today")).toHaveFocus();
});

test("an empty field closes when focus leaves it", async () => {
  await renderBoard();
  fireEvent.click(plus("Doing"));
  fireEvent.blur(fieldIn("Doing"));
  expect(screen.queryByRole("textbox", { name: "New task in Doing" })).toBeNull();
  expect(plus("Doing")).toHaveFocus();
});

test("a field with text stays when focus leaves it", async () => {
  await renderBoard();
  fireEvent.click(plus("Doing"));
  fireEvent.change(fieldIn("Doing"), { target: { value: "Half a thought" } });
  fireEvent.blur(fieldIn("Doing"));
  expect(fieldIn("Doing")).toHaveValue("Half a thought");
});

test("drop_index_skips_field", async () => {
  stubRects();
  const backend = await renderBoard();
  fireEvent.click(plus("Today"));
  // Backlog: field then b1 at y 100. Today: field 40-90, t1 100-150, t2 160-210.
  const el = card("Draft outline");
  pointer("pointerdown", el, 50, 120);
  pointer("pointermove", el, 50, 130);
  pointer("pointermove", el, 300, 105);
  pointer("pointerup", el, 300, 105);
  await settle();
  expect(argsOf(backend.calls, "task_move")).toEqual([{ id: "b1", lane: "today", index: 0 }]);
});

test("arrow_up_into_header", async () => {
  await renderBoard();
  card("Write intro").focus();
  key(card("Write intro"), "ArrowUp");
  expect(heading("Today")).toHaveFocus();
});

test("header_arrows_cross_columns", async () => {
  await renderBoard();
  heading("Today").setAttribute("tabindex", "-1");
  heading("Today").focus();
  key(heading("Today"), "ArrowRight");
  expect(screen.getByRole("button", { name: "Fold Today" })).toHaveFocus();
  key(document.activeElement as Element, "ArrowRight");
  expect(plus("Today")).toHaveFocus();
  key(plus("Today"), "ArrowRight");
  expect(heading("Doing")).toHaveFocus();
  key(heading("Doing"), "ArrowLeft");
  expect(plus("Today")).toHaveFocus();
  key(plus("Today"), "ArrowDown");
  expect(card("Write intro")).toHaveFocus();
});
