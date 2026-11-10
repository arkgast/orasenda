import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Toast } from "./toast";

test("renders_neutral_with_word_or_shape", () => {
  const { container } = render(<Toast>Saved once.</Toast>);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Saved once.");
  expect(status.querySelector("circle[fill='none']")).not.toBeNull();
  expect(container.querySelector("[data-slot='toast']")).not.toBeNull();
});

test("renders_warning_with_word_or_shape", () => {
  const { container } = render(<Toast tone="warning">Two minutes left.</Toast>);
  expect(screen.getByRole("status")).toHaveTextContent("Two minutes left.");
  expect(container.querySelector("[data-slot='inline-notice'][data-tone='warning']")).not.toBeNull();
  expect(container.querySelector("path[d^='M5 0.5']")).not.toBeNull();
});

test("exposes_status_with_name", () => {
  render(<Toast>Hello</Toast>);
  expect(screen.getByRole("status")).toHaveTextContent("Hello");
});

test("shows_dismiss_button_only_with_handler", () => {
  const onDismiss = vi.fn();
  const { rerender } = render(<Toast>Hi</Toast>);
  expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  rerender(<Toast onDismiss={onDismiss}>Hi</Toast>);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("action_uses_actionname_and_calls_back", () => {
  const onAction = vi.fn();
  render(
    <Toast actionLabel="Undo" actionName="Undo moving task" onAction={onAction}>
      Moved
    </Toast>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo moving task" }));
  expect(onAction).toHaveBeenCalledTimes(1);
});
