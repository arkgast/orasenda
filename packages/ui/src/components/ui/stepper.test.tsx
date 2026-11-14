import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Stepper } from "./stepper";

function setup(value: number, over: Partial<Parameters<typeof Stepper>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <Stepper
      label="Estimate"
      value={value}
      min={0}
      max={12}
      onChange={onChange}
      zeroLabel="No estimate"
      valueText={(n) => `${n} sessions`}
      {...over}
    />,
  );
  return { onChange, spin: screen.getByRole("spinbutton", { name: "Estimate" }) };
}

test("stepper_is_a_spinbutton_with_value_and_text", () => {
  const { spin } = setup(3);
  expect(spin).toHaveAttribute("aria-valuenow", "3");
  expect(spin).toHaveAttribute("aria-valuemin", "0");
  expect(spin).toHaveAttribute("aria-valuemax", "12");
  expect(spin).toHaveAttribute("aria-valuetext", "3 sessions");
  expect(spin).toHaveTextContent("3 sessions");
});

test("stepper_zero_label_replaces_the_text_at_zero", () => {
  const { spin } = setup(0);
  expect(spin).toHaveAttribute("aria-valuetext", "No estimate");
  expect(spin).toHaveTextContent("No estimate");
});

test("stepper_buttons_step_by_one", () => {
  const { onChange } = setup(3);
  fireEvent.click(screen.getByRole("button", { name: "Increase Estimate" }));
  fireEvent.click(screen.getByRole("button", { name: "Decrease Estimate" }));
  expect(onChange.mock.calls).toEqual([[4], [2]]);
});

test("stepper_arrow_keys_step_and_home_end_jump", () => {
  const { onChange, spin } = setup(3);
  fireEvent.keyDown(spin, { key: "ArrowUp" });
  fireEvent.keyDown(spin, { key: "ArrowDown" });
  fireEvent.keyDown(spin, { key: "Home" });
  fireEvent.keyDown(spin, { key: "End" });
  expect(onChange.mock.calls).toEqual([[4], [2], [0], [12]]);
});

test("stepper_stops_at_its_bounds", () => {
  const { onChange, spin } = setup(12);
  expect(screen.getByRole("button", { name: "Increase Estimate" })).toBeDisabled();
  fireEvent.keyDown(spin, { key: "ArrowUp" });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Decrease Estimate" })).not.toBeDisabled();
});

test("stepper_buttons_meet_hit_min", () => {
  setup(3);
  for (const name of ["Increase Estimate", "Decrease Estimate"]) {
    expect(screen.getByRole("button", { name }).className).toContain("size-hit-min");
  }
});

test("stepper_falls_back_to_the_number", () => {
  const { spin } = setup(2, { valueText: undefined, zeroLabel: undefined });
  expect(spin).toHaveAttribute("aria-valuetext", "2");
});
