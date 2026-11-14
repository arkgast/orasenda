import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Select } from "./select";

const options = [
  { value: "backlog", label: "Backlog" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done", disabled: true },
];

test("select_is_a_native_select_named_by_its_visible_label", () => {
  render(<Select label="Column" options={options} defaultValue="doing" />);
  const select = screen.getByRole("combobox", { name: "Column" }) as HTMLSelectElement;
  expect(select.tagName).toBe("SELECT");
  expect(select.value).toBe("doing");
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
    "Backlog",
    "Doing",
    "Done",
  ]);
  expect(screen.getByRole("option", { name: "Done" })).toBeDisabled();
  expect(select.className).toContain("min-h-hit-min");
});

test("select_reports_changes", () => {
  const onChange = vi.fn();
  render(<Select label="Column" options={options} defaultValue="backlog" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Column"), { target: { value: "doing" } });
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("select_label_hidden_keeps_the_name_and_weights_the_value", () => {
  render(<Select label="Period" labelHidden options={options} />);
  const select = screen.getByRole("combobox", { name: "Period" });
  expect(screen.getByText("Period")).toHaveClass("sr-only");
  expect(select.className).toContain("font-semibold");
});

test("select_disabled_says_why_through_the_helper", () => {
  render(<Select label="Column" options={options} disabled helper="Done tasks stay put." />);
  const select = screen.getByRole("combobox", { name: "Column" });
  expect(select).toBeDisabled();
  expect(select).toHaveAccessibleDescription("Done tasks stay put.");
});
