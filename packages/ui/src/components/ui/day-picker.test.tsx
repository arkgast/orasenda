import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { DayPicker, type DayPickerProps } from "./day-picker";
import { DayPickerSpecimen } from "./day-picker.specimen";

const NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS = 0b0011111; // Monday to Friday
const EVERY_DAY = 0b1111111;

function Controlled(props: Partial<DayPickerProps> & { initial: number }) {
  const [value, setValue] = useState(props.initial);
  return (
    <DayPicker
      label="Days"
      {...props}
      value={value}
      onChange={(next) => {
        props.onChange?.(next);
        setValue(next);
      }}
    />
  );
}

test("seven_toggle_buttons_in_a_group_named_by_label", () => {
  render(<DayPicker label="Repeat on" value={EVERY_DAY} onChange={() => {}} />);
  const group = screen.getByRole("group", { name: "Repeat on" });
  expect(group).toHaveAttribute("data-slot", "day-picker");
  const buttons = within(group).getAllByRole("button");
  expect(buttons).toHaveLength(7);
  for (const b of buttons) expect(b).toHaveAttribute("aria-pressed");
  expect(buttons.map((b) => b.getAttribute("type"))).toEqual(Array(7).fill("button"));
});

test("each_day_shows_its_letter_and_is_named_by_its_full_weekday", () => {
  render(<DayPicker label="Days" value={EVERY_DAY} onChange={() => {}} />);
  const buttons = screen.getAllByRole("button");
  expect(buttons.map((b) => b.textContent?.charAt(0))).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  NAMES.forEach((name, i) => {
    expect(screen.getByRole("button", { name })).toBe(buttons[i]);
  });
  const letter = buttons[0]?.querySelector("[data-slot=day-picker-letter]");
  expect(letter).toHaveAttribute("aria-hidden", "true");
  expect(letter).toHaveTextContent("M");
});

test("value_is_the_mask_monday_1_to_sunday_64", () => {
  render(<DayPicker label="Days" value={1 | 4 | 64} onChange={() => {}} />);
  const pressed = screen
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.getAttribute("data-day"));
  expect(pressed).toEqual(["monday", "wednesday", "sunday"]);
});

test("toggling_a_day_reports_the_new_mask", () => {
  const onChange = vi.fn();
  render(<Controlled initial={WEEKDAYS} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Saturday" }));
  expect(onChange).toHaveBeenLastCalledWith(WEEKDAYS | 32);
  expect(screen.getByRole("button", { name: "Saturday" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Monday" }));
  expect(onChange).toHaveBeenLastCalledWith((WEEKDAYS | 32) & ~1);
  expect(screen.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "false");
});

test("space_and_enter_toggle_through_the_native_button", () => {
  const onChange = vi.fn();
  render(<Controlled initial={WEEKDAYS} onChange={onChange} />);
  const sunday = screen.getByRole("button", { name: "Sunday" });
  sunday.focus();
  expect(sunday).toHaveFocus();
  // A native button turns Enter and Space into a click; jsdom needs the click itself.
  fireEvent.click(sunday);
  expect(onChange).toHaveBeenLastCalledWith(WEEKDAYS | 64);
});

test("the_last_day_on_cannot_be_turned_off_and_the_helper_says_so", () => {
  const onChange = vi.fn();
  render(<Controlled initial={4} onChange={onChange} />);
  const wednesday = screen.getByRole("button", { name: "Wednesday" });
  expect(wednesday).toHaveAttribute("aria-disabled", "true");
  expect(wednesday).not.toBeDisabled();
  fireEvent.click(wednesday);
  expect(onChange).not.toHaveBeenCalled();
  expect(wednesday).toHaveAttribute("aria-pressed", "true");
  const group = screen.getByRole("group", { name: "Days" });
  expect(group).toHaveAccessibleDescription("At least one day stays on.");
  expect(screen.getByText("At least one day stays on.")).toHaveAttribute(
    "data-slot",
    "day-picker-helper",
  );
  // Other days stay free to turn on.
  expect(screen.getByRole("button", { name: "Friday" })).not.toHaveAttribute("aria-disabled");
});

test("the_locked_day_carries_the_reason_itself", () => {
  render(<Controlled initial={4} onChange={() => {}} />);
  // VoiceOver may skip a group's description while focus moves inside it, so the button says why.
  expect(screen.getByRole("button", { name: "Wednesday" })).toHaveAccessibleDescription(
    "At least one day stays on.",
  );
  expect(screen.getByRole("button", { name: "Friday" })).not.toHaveAttribute("aria-describedby");
});

test("the_locked_day_keeps_its_fill_on_hover", () => {
  render(<DayPicker label="Days" value={1} onChange={() => {}} />);
  const cls = screen.getByRole("button", { name: "Monday" }).className;
  // Hover changes only apply to a day that can be pressed, so a locked day never looks pressable.
  expect(cls).toContain("aria-pressed:not-aria-disabled:hover:bg-focus-hover");
  expect(cls).toContain("not-aria-disabled:hover:bg-surface-sunken");
  expect(cls).not.toMatch(/(^|\s)aria-pressed:hover:/);
  expect(cls).not.toMatch(/(^|\s)hover:bg-surface-sunken/);
});

test("helper_line_is_the_hosts_while_two_or_more_days_are_on", () => {
  const { rerender } = render(
    <DayPicker label="Days" value={WEEKDAYS} helper="Weekdays" onChange={() => {}} />,
  );
  expect(screen.getByRole("group", { name: "Days" })).toHaveAccessibleDescription("Weekdays");
  for (const b of screen.getAllByRole("button")) expect(b).not.toHaveAttribute("aria-disabled");
  rerender(<DayPicker label="Days" value={2} helper="Tuesdays" onChange={() => {}} />);
  expect(screen.getByRole("group", { name: "Days" })).toHaveAccessibleDescription(
    "Tuesdays. At least one day stays on.",
  );
});

test("helper_line_has_a_plain_default", () => {
  render(<DayPicker label="Days" value={WEEKDAYS} onChange={() => {}} />);
  expect(screen.getByRole("group", { name: "Days" })).toHaveAccessibleDescription(
    "Pick the days it runs.",
  );
});

test("an_empty_mask_lets_any_day_turn_on", () => {
  const onChange = vi.fn();
  render(<DayPicker label="Days" value={0} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Thursday" }));
  expect(onChange).toHaveBeenCalledWith(8);
});

test("bits_above_sunday_are_ignored", () => {
  const onChange = vi.fn();
  render(<DayPicker label="Days" value={EVERY_DAY | 128} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Sunday" }));
  expect(onChange).toHaveBeenCalledWith(EVERY_DAY & ~64);
});

test("disabled_turns_every_day_off_for_input", () => {
  const onChange = vi.fn();
  render(<DayPicker label="Days" value={WEEKDAYS} disabled onChange={onChange} />);
  for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
});

test("on_and_off_differ_in_shape_not_only_colour", () => {
  render(<DayPicker label="Days" value={1} onChange={() => {}} />);
  const on = screen.getByRole("button", { name: "Monday" });
  const off = screen.getByRole("button", { name: "Tuesday" });
  // On is a filled disc with a bold letter; off is a hollow ring with a regular letter.
  expect(on.className).toContain("aria-pressed:bg-focus");
  expect(on.className).toContain("aria-pressed:font-semibold");
  expect(off.className).toContain("border-2");
  expect(on.className).toContain("rounded-pill");
});

test("hit_targets_are_hit_min_with_a_focus_ring", () => {
  render(<DayPicker label="Days" value={WEEKDAYS} onChange={() => {}} />);
  for (const b of screen.getAllByRole("button")) {
    expect(b.className).toContain("size-hit-min");
    expect(b.className).toContain("focus-visible:outline-2");
    expect(b.className).toContain("outline-focus-ring");
  }
});

test("specimen_renders_in_light_and_dark", () => {
  for (const theme of ["light", "dark"]) {
    const { container, unmount } = render(
      <div data-theme={theme}>
        <DayPickerSpecimen />
      </div>,
    );
    const frames = container.querySelectorAll("[data-frame]");
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole("group").length).toBe(frames.length);
    unmount();
  }
});
