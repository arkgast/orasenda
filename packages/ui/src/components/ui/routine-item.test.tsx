import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RoutineItem } from "./routine-item";

test("exposes_checkbox_with_name", () => {
  render(<RoutineItem label="Stretch" detail="Two minutes" />);
  const box = screen.getByRole("checkbox", { name: /Stretch/ });
  expect(box.tagName).toBe("BUTTON");
  expect(box.getAttribute("aria-checked")).toBe("false");
  expect(screen.getByText("Two minutes")).toBeTruthy();
});

test("renders_open_without_tick", () => {
  render(<RoutineItem label="Stretch" />);
  const box = screen.getByRole("checkbox");
  expect(box.querySelector("svg")).toBeNull();
});

test("renders_done_with_tick_and_aria_checked", () => {
  render(<RoutineItem label="Stretch" defaultDone />);
  const box = screen.getByRole("checkbox", { name: /Stretch/ });
  expect(box.getAttribute("aria-checked")).toBe("true");
  expect(box.querySelector("svg")).not.toBeNull();
});

test("renders_optional_with_word", () => {
  render(<RoutineItem label="Stretch" optional />);
  expect(screen.getByText("Optional")).toBeTruthy();
});

test("preview_keeps_local_state_without_on_change", () => {
  render(<RoutineItem label="Stretch" />);
  const box = screen.getByRole("checkbox");
  fireEvent.click(box);
  expect(box.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(box);
  expect(box.getAttribute("aria-checked")).toBe("false");
});

test("controlled_host_owns_completion", () => {
  const onChange = vi.fn();
  render(<RoutineItem label="Stretch" done={false} onChange={onChange} />);
  const box = screen.getByRole("checkbox");
  fireEvent.click(box);
  expect(onChange).toHaveBeenCalledWith(true);
  expect(box.getAttribute("aria-checked")).toBe("false");
});

test("disabled_does_not_toggle", () => {
  const onChange = vi.fn();
  render(<RoutineItem label="Stretch" done={false} onChange={onChange} disabled />);
  const box = screen.getByRole("checkbox");
  expect(box.hasAttribute("disabled")).toBe(true);
  fireEvent.click(box);
  expect(onChange).not.toHaveBeenCalled();
});

test("enter_does_not_toggle_and_box_is_focusable", () => {
  render(<RoutineItem label="Stretch" />);
  const box = screen.getByRole("checkbox");
  box.focus();
  expect(document.activeElement).toBe(box);
  expect(box.getAttribute("tabindex")).not.toBe("-1");
  fireEvent.keyDown(box, { key: "Enter" });
  expect(box.getAttribute("aria-checked")).toBe("false");
});

test("read_only_is_a_plain_row_with_no_checkbox_and_no_tab_stop", () => {
  const { container } = render(
    <RoutineItem label="Stretch" detail="2-minute version: one stretch." optional readOnly />,
  );
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(container.querySelector("button, [tabindex]")).toBeNull();
  const row = container.querySelector("[data-slot=routine-item]");
  expect(row).toHaveAttribute("data-read-only");
  expect(row).toHaveTextContent("Stretch");
  expect(row).toHaveTextContent("2-minute version: one stretch.");
  expect(row).toHaveTextContent("Optional");
  expect(row?.querySelector("[data-slot=routine-item-check]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});

test("name_overrides_the_spoken_name", () => {
  render(
    <RoutineItem label="Done today" name="Done today: Stretch" done={false} onChange={() => {}} />,
  );
  expect(screen.getByRole("checkbox", { name: "Done today: Stretch" })).toBeInTheDocument();
});
