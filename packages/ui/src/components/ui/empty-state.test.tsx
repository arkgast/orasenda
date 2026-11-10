import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { EmptyState } from "./empty-state";

test("empty_state_inline_has_one_line_and_no_action", () => {
  const text =
    "Nothing is recorded yet. Choosing which apps count as focus or distraction comes in a later update.";
  const { container } = render(<EmptyState variant="inline" message={text} />);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  const paras = container.querySelectorAll("p");
  expect(paras).toHaveLength(1);
  expect(paras[0]).toHaveTextContent(text);
});

test("renders_default_with_word_heading_and_message", () => {
  render(<EmptyState />);
  expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeTruthy();
  expect(screen.getByText("That's fine. Start when you're ready.")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  expect(document.querySelector("[data-slot=empty-state][data-variant=default]")).not.toBeNull();
});

test("renders_inline_default_message", () => {
  render(<EmptyState variant="inline" />);
  expect(screen.getByText("Nothing here yet.")).toBeTruthy();
});

test("exposes_button_with_name_and_calls_action", () => {
  const onAction = vi.fn();
  render(<EmptyState actionLabel="Add a task" onAction={onAction} />);
  fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
  expect(onAction).toHaveBeenCalledOnce();
});

test("omits_button_without_handler", () => {
  render(<EmptyState actionLabel="Add a task" />);
  expect(screen.queryByRole("button")).toBeNull();
});
