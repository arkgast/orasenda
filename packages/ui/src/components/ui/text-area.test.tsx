import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TextArea } from "./text-area";

const FIELD_ERROR = "Could not save. Your note is still here.";

function describedBy(control: HTMLElement, suffix: string): HTMLElement {
  const ids = (control.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  const node = ids.map((id) => document.getElementById(id)).find((n) => n?.id.endsWith(suffix));
  if (!node) throw new Error(`no ${suffix} paragraph in aria-describedby`);
  return node;
}

test("exposes_textbox_with_name", () => {
  render(<TextArea label="Notes" />);
  const box = screen.getByRole("textbox", { name: "Notes" });
  expect(box.tagName).toBe("TEXTAREA");
  expect(box).toHaveAttribute("data-slot", "text-area");
});

test("rows_default_to_four_and_can_be_set", () => {
  const { rerender } = render(<TextArea label="Notes" />);
  expect(screen.getByLabelText("Notes")).toHaveAttribute("rows", "4");
  rerender(<TextArea label="Notes" rows={7} />);
  expect(screen.getByLabelText("Notes")).toHaveAttribute("rows", "7");
});

test("renders_helper_linked_with_aria_describedby", () => {
  render(<TextArea label="Notes" helper="Escape saves." />);
  expect(describedBy(screen.getByLabelText("Notes"), "-helper")).toHaveTextContent("Escape saves.");
});

test("renders_error_with_word_and_shape", () => {
  render(<TextArea label="Notes" error={FIELD_ERROR} defaultValue="keep me" />);
  const box = screen.getByLabelText("Notes");
  expect(box).toHaveAttribute("aria-invalid", "true");
  expect(box).toHaveValue("keep me");
  const err = describedBy(box, "-error");
  expect(err).toHaveTextContent(FIELD_ERROR);
  expect(err.querySelector("svg[aria-hidden=true]")).not.toBeNull();
});

test("field_error_is_described_not_live", () => {
  const { container } = render(<TextArea label="Notes" error={FIELD_ERROR} />);
  expect(container.querySelectorAll("[role=status],[role=alert],[aria-live]")).toHaveLength(0);
  const err = describedBy(screen.getByLabelText("Notes"), "-error");
  expect(err.hasAttribute("role")).toBe(false);
  expect(err.hasAttribute("aria-live")).toBe(false);
});

test("keeps_consumer_aria_describedby_first_and_disabled", () => {
  render(<TextArea id="x" label="Notes" helper="Help" aria-describedby="outside" disabled />);
  const box = screen.getByLabelText("Notes");
  expect(box.getAttribute("aria-describedby")).toBe("outside x-helper");
  expect(box).toBeDisabled();
});

test("keeps_minimum_hit_height_for_small_rows", () => {
  render(<TextArea label="Notes" rows={1} />);
  expect(screen.getByLabelText("Notes")).toHaveClass("min-h-hit-min");
});
