import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { TaskPicker, type TaskPickerOption, type TaskPickerProps } from "./task-picker";

const OPTIONS: TaskPickerOption[] = [
  { id: "b1", title: "Plan the offsite", lane: "backlog", laneLabel: "Backlog" },
  { id: "t1", title: "Write the report", lane: "today", laneLabel: "Today" },
  { id: "d1", title: "Draft the Outline", lane: "doing", laneLabel: "Doing", frog: true },
  { id: "d2", title: "Review the budget", lane: "doing", laneLabel: "Doing" },
];

function setup(over: Partial<TaskPickerProps> = {}) {
  const onPick = vi.fn();
  const view = render(<TaskPicker options={OPTIONS} onPick={onPick} {...over} />);
  return { onPick, ...view };
}

const quiet = () => screen.getByRole("button", { name: "Add a task" });

test("task_picker_rests_as_quiet_text", () => {
  setup();
  const button = quiet();
  expect(button.className).toMatch(/text-ink-muted/);
  expect(button.className).not.toMatch(/border-line|bg-surface/);
  expect(screen.queryByRole("combobox")).toBeNull();
});

test("task_picker_opens_a_combobox_with_options_in_lane_order", async () => {
  const user = userEvent.setup();
  setup();
  await user.click(quiet());
  const box = screen.getByRole("combobox");
  expect(box).toHaveFocus();
  expect(box).toHaveAttribute("aria-expanded", "true");
  expect(box).toHaveAttribute("aria-autocomplete", "list");
  const list = screen.getByRole("listbox");
  expect(box.getAttribute("aria-controls")).toBe(list.id);
  const names = within(list)
    .getAllByRole("option")
    .map((o) => o.textContent);
  expect(names).toEqual([
    "Draft the OutlineDoingFrog",
    "Review the budgetDoing",
    "Write the reportToday",
    "Plan the offsiteBacklog",
  ]);
  expect(box.getAttribute("aria-activedescendant")).toBe(within(list).getAllByRole("option")[0]?.id);
});

test("task_picker_filters_while_typing", async () => {
  const user = userEvent.setup();
  setup();
  await user.click(quiet());
  await user.type(screen.getByRole("combobox"), "OUTLINE");
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(1);
  expect(options[0]).toHaveTextContent("Draft the Outline");
  await user.clear(screen.getByRole("combobox"));
  await user.type(screen.getByRole("combobox"), "zzz");
  expect(screen.queryByRole("option")).toBeNull();
  expect(screen.getByText("No matching tasks")).toBeVisible();
  expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-activedescendant");
});

test("task_picker_arrows_move_and_enter_picks", async () => {
  const user = userEvent.setup();
  const { onPick } = setup();
  await user.click(quiet());
  await user.keyboard("{ArrowDown}{ArrowDown}");
  const active = screen.getAllByRole("option")[2] as HTMLElement;
  expect(screen.getByRole("combobox").getAttribute("aria-activedescendant")).toBe(active.id);
  expect(active).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{Enter}");
  expect(onPick).toHaveBeenCalledWith("t1");
  expect(screen.queryByRole("combobox")).toBeNull();
  await user.click(quiet());
  await user.keyboard("{ArrowUp}");
  expect(screen.getAllByRole("option")[3]).toHaveAttribute("aria-selected", "true");
});

test("task_picker_click_on_an_option_picks_it", async () => {
  const user = userEvent.setup();
  const { onPick } = setup();
  await user.click(quiet());
  await user.click(screen.getByRole("option", { name: /Write the report/ }));
  expect(onPick).toHaveBeenCalledWith("t1");
});

test("task_picker_esc_restores_quiet_text", async () => {
  const user = userEvent.setup();
  const { onPick } = setup();
  await user.click(quiet());
  await user.keyboard("zz{Escape}");
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(quiet()).toHaveFocus();
  expect(onPick).not.toHaveBeenCalled();
});

test("task_picker_blur_without_picking_restores", async () => {
  const user = userEvent.setup();
  const { onPick } = setup();
  await user.click(quiet());
  await user.tab();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(onPick).not.toHaveBeenCalled();
});

test("task_picker_shows_the_task_and_clears_it", async () => {
  const user = userEvent.setup();
  const { onPick } = setup({ task: { id: "d1", title: "Draft the Outline" } });
  expect(screen.queryByRole("button", { name: "Add a task" })).toBeNull();
  expect(screen.getByRole("button", { name: /Draft the Outline/ })).toHaveClass("text-ink-muted");
  await user.click(screen.getByRole("button", { name: "Clear task" }));
  expect(onPick).toHaveBeenCalledWith(null);
});

test("task_picker_clear_task", () => {
  const { onPick } = setup({ task: { id: "d1", title: "Draft the Outline" } });
  fireEvent.click(screen.getByRole("button", { name: "Clear task" }));
  expect(onPick).toHaveBeenCalledTimes(1);
  expect(onPick).toHaveBeenCalledWith(null);
});

test("task_picker_title_reopens_the_input", async () => {
  const user = userEvent.setup();
  setup({ task: { id: "d1", title: "Draft the Outline" } });
  await user.click(screen.getByRole("button", { name: /Draft the Outline/ }));
  expect(screen.getByRole("combobox")).toHaveFocus();
});

test("task_picker_quiet_label_is_settable", () => {
  setup({ quietLabel: "Pick a task" });
  expect(screen.getByRole("button", { name: "Pick a task" })).toBeVisible();
});

test("task_picker_an_empty_options_list_says_so", async () => {
  const user = userEvent.setup();
  setup({ options: [] });
  await user.click(quiet());
  expect(screen.getByText("No matching tasks")).toBeVisible();
});
