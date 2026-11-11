import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Input } from "./input";

const FIELD_ERROR = "Between 5 and 180 minutes. Still using 45.";

function describedBy(control: HTMLElement, suffix: string): HTMLElement {
  const ids = (control.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  const node = ids.map((id) => document.getElementById(id)).find((n) => n?.id.endsWith(suffix));
  if (!node) throw new Error(`no ${suffix} paragraph in aria-describedby`);
  return node;
}

test("exposes_textbox_with_name", () => {
  render(<Input label="Task name" placeholder="Write the report" />);
  const box = screen.getByRole("textbox", { name: "Task name" });
  expect(box).toHaveAttribute("data-slot", "input");
});

test("renders_helper_linked_with_aria_describedby", () => {
  render(<Input label="Task name" helper="Keep it short." />);
  const box = screen.getByRole("textbox", { name: "Task name" });
  expect(describedBy(box, "-helper")).toHaveTextContent("Keep it short.");
});

test("renders_error_with_word_and_shape", () => {
  render(<Input label="Focus minutes" error={FIELD_ERROR} defaultValue="45" />);
  const box = screen.getByLabelText("Focus minutes");
  expect(box).toHaveAttribute("aria-invalid", "true");
  expect(box).toHaveValue("45");
  const err = describedBy(box, "-error");
  expect(err).toHaveTextContent(FIELD_ERROR);
  expect(err.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  expect(err.querySelector("svg[fill=currentColor]")).toBeNull();
});

test("field_error_is_described_not_live", () => {
  const { container } = render(<Input label="Focus minutes" error={FIELD_ERROR} />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(container.querySelectorAll("[role=status],[role=alert],[aria-live]")).toHaveLength(0);
  const err = describedBy(screen.getByLabelText("Focus minutes"), "-error");
  expect(err.textContent).toBe(FIELD_ERROR);
  expect(err.hasAttribute("role")).toBe(false);
  expect(err.hasAttribute("aria-live")).toBe(false);
});

test("id_prop_names_helper_and_error_lines", () => {
  render(<Input id="mins" label="Focus minutes" helper="In minutes." error="Too long." />);
  const box = screen.getByLabelText("Focus minutes");
  expect(box.id).toBe("mins");
  expect(document.getElementById("mins-helper")).toHaveTextContent("In minutes.");
  expect(document.getElementById("mins-error")).toHaveTextContent("Too long.");
  expect(box.getAttribute("aria-describedby")).toBe("mins-helper mins-error");
});

test("keeps_consumer_aria_describedby_first", () => {
  render(<Input id="x" label="Name" helper="Help" aria-describedby="outside" />);
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBe("outside x-helper");
});

test("input_unit_renders_suffix_after_number_field", () => {
  const { rerender } = render(<Input label="Focus minutes" type="number" unit="min" />);
  const input = screen.getByRole("spinbutton", { name: "Focus minutes" });
  expect(input.hasAttribute("unit")).toBe(false);
  const suffix = screen.getByText("min");
  expect(input.compareDocumentPosition(suffix) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  rerender(<Input label="Focus minutes" type="number" />);
  expect(screen.queryByText("min")).toBeNull();
});

test("renders_disabled_state_natively", () => {
  render(<Input label="Name" disabled />);
  expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
});

test("the unit control is number-width, not full width", () => {
  render(<Input label="Minutes" unit="min" type="number" />);
  const cls = screen.getByLabelText("Minutes").className.split(" ");
  expect(cls).toContain("w-number-width");
  expect(cls).not.toContain("w-full");
});

test("the field keeps its font sizes next to colours", () => {
  render(<Input label="Name" helper="Hi" />);
  expect(screen.getByLabelText("Name").className).toContain("text-body");
  expect(screen.getByText("Name").className).toContain("text-body-sm");
});
