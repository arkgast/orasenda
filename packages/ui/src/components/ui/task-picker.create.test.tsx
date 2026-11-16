import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TaskPicker, type TaskPickerOption, type TaskPickerProps } from "./task-picker";

const OPTIONS: TaskPickerOption[] = [
  { id: "b1", title: "Plan the offsite", lane: "backlog", laneLabel: "Backlog", week: true },
  {
    id: "d1",
    title: "Draft the outline",
    lane: "doing",
    laneLabel: "Doing",
    frog: true,
    week: true,
  },
  { id: "t1", title: "Write the report", lane: "today", laneLabel: "Today" },
];

function setup(over: Partial<TaskPickerProps> = {}) {
  const onPick = vi.fn();
  const onCreate = vi.fn();
  render(<TaskPicker options={OPTIONS} onPick={onPick} onCreate={onCreate} {...over} />);
  fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
  return { onPick, onCreate };
}
const type = (value: string) =>
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
const press = (key: string) => fireEvent.keyDown(screen.getByRole("combobox"), { key });
const rows = () => within(screen.getByRole("listbox")).getAllByRole("option");

test("create_row_last_when_query", () => {
  setup();
  type("the");
  const all = rows();
  expect(all).toHaveLength(4);
  expect(all[3]).toHaveAccessibleName('Add "the" to Backlog');
  expect(all[3].className).toMatch(/min-h-hit-min/);
});

test("create_row_absent_without_on_create", () => {
  setup({ onCreate: undefined });
  type("the");
  expect(rows()).toHaveLength(3);
  type("zzz");
  expect(screen.getByText("No matching tasks")).toBeInTheDocument();
});

test("create_row_absent_for_blank_query", () => {
  setup();
  type("   ");
  press("ArrowDown");
  expect(screen.queryByText(/to Backlog/)).toBeNull();
});

test("return_on_create_row_calls_on_create", () => {
  const { onCreate, onPick } = setup();
  type("  zzz new  ");
  expect(rows()).toHaveLength(1);
  press("Enter");
  expect(onCreate).toHaveBeenCalledWith("zzz new");
  expect(onPick).not.toHaveBeenCalled();
  expect(screen.queryByRole("combobox")).toBeNull();
});

test("create_row_reached_by_arrows_and_click", () => {
  const { onCreate } = setup();
  type("the");
  press("ArrowUp");
  expect(rows()[3]).toHaveAttribute("aria-selected", "true");
  fireEvent.click(rows()[3]);
  expect(onCreate).toHaveBeenCalledWith("the");
});

test("create_row_hit_min_and_focus_bar", () => {
  setup();
  type("zzz");
  const row = rows()[0];
  expect(row).toHaveAttribute("aria-selected", "true");
  expect(row.className).toMatch(/min-h-hit-min/);
  expect(row.className).toMatch(/border-focus/);
  expect(row).toHaveTextContent("Selected");
});

test("long_query_keeps_full_name", () => {
  setup();
  const long = "q".repeat(120);
  type(long);
  expect(rows()[0]).toHaveAccessibleName(`Add "${long}" to Backlog`);
  expect(rows()[0].querySelector(".truncate")).not.toBeNull();
});

test("week_marker_after_lane_word", () => {
  setup();
  type("the");
  const all = rows();
  const text = (i: number) => all[i].textContent?.replace("Selected", "");
  expect(text(0)).toBe("Draft the outlineDoing · Frog · This week");
  expect(text(1)).toBe("Write the reportToday");
  expect(text(2)).toBe("Plan the offsiteBacklog · This week");
});

test("esc_with_create_row_picks_nothing", () => {
  const { onCreate, onPick } = setup();
  type("zzz");
  press("Escape");
  expect(onCreate).not.toHaveBeenCalled();
  expect(onPick).not.toHaveBeenCalled();
});

test("blur_with_create_row_picks_nothing", () => {
  const { onCreate, onPick } = setup();
  type("zzz");
  fireEvent.blur(screen.getByRole("combobox"));
  expect(onCreate).not.toHaveBeenCalled();
  expect(onPick).not.toHaveBeenCalled();
});
