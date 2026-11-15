import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { expect, test, vi } from "vitest";
import { Dialog } from "./dialog";
import { type ImportPreviewItem, ImportPreviewList } from "./import-preview-list";

const items: ImportPreviewItem[] = [
  { key: "a", title: "Buy stamps", meta: "Due 20 Nov", checked: true },
  { key: "b", title: "Call the bank", why: "Already on the Board, in Today", checked: true },
  { key: "c", title: "Plan the trip", meta: "Work", checked: false },
];

function setup(over: Partial<Parameters<typeof ImportPreviewList>[0]> = {}) {
  const onToggle = vi.fn();
  const onSetAll = vi.fn();
  render(
    <ImportPreviewList
      label="Tasks from Reminders"
      items={items}
      onToggle={onToggle}
      onSetAll={onSetAll}
      {...over}
    />,
  );
  return { onToggle, onSetAll };
}

test("preview_list_one_tab_stop", () => {
  setup();
  const group = screen.getByRole("group", { name: "Tasks from Reminders" });
  const boxes = within(group).getAllByRole("checkbox");
  expect(boxes).toHaveLength(3);
  expect(boxes.filter((b) => b.tabIndex === 0)).toHaveLength(1);
  boxes[0]?.focus();
  fireEvent.keyDown(boxes[0] as HTMLElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(boxes[1]);
  fireEvent.keyDown(boxes[1] as HTMLElement, { key: "End" });
  expect(document.activeElement).toBe(boxes[2]);
  expect(boxes[2]?.tabIndex).toBe(0);
  expect(boxes[0]?.tabIndex).toBe(-1);
  fireEvent.keyDown(boxes[2] as HTMLElement, { key: "ArrowUp" });
  fireEvent.keyDown(boxes[1] as HTMLElement, { key: "Home" });
  expect(document.activeElement).toBe(boxes[0]);
});

test("preview_list_space_toggles", () => {
  const { onToggle } = setup();
  const box = screen.getByRole("checkbox", { name: "Plan the trip" });
  fireEvent.click(box);
  expect(onToggle).toHaveBeenCalledWith("c");
  expect(box).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Buy stamps" })).toBeChecked();
});

test("preview_list_select_all_none", () => {
  const { onSetAll } = setup();
  expect(screen.getByText("2 of 3 selected")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Select all" }));
  expect(onSetAll).toHaveBeenCalledWith(true);
});

test("preview_list_select_none_when_all_selected", () => {
  const { onSetAll } = setup({ items: items.map((i) => ({ ...i, checked: true })) });
  expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Select none" }));
  expect(onSetAll).toHaveBeenCalledWith(false);
});

test("preview_list_count_is_not_live", () => {
  setup();
  const count = screen.getByText("2 of 3 selected");
  expect(count.closest("[aria-live]")).toBeNull();
  expect(count.closest("[role=status]")).toBeNull();
});

test("preview_list_names_and_descriptions", () => {
  setup({ summary: ["Showing 3 of 3 tasks."] });
  const box = screen.getByRole("checkbox", { name: "Call the bank" });
  expect(box).toHaveAccessibleDescription("Already on the Board, in Today");
  expect(screen.getByRole("checkbox", { name: "Buy stamps" })).toHaveAccessibleDescription(
    "Due 20 Nov",
  );
  expect(screen.getByText("Showing 3 of 3 tasks.")).toBeVisible();
});

test("preview_list_renders_five_hundred_rows", () => {
  const many = Array.from({ length: 500 }, (_, i) => ({
    key: String(i),
    title: `Task ${i}`,
    checked: i % 2 === 0,
  }));
  setup({ items: many });
  expect(screen.getAllByRole("checkbox")).toHaveLength(500);
  expect(screen.getByText("250 of 500 selected")).toBeVisible();
});

test("preview_list_keeps_one_tab_stop_when_items_shrink", () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, title: `Task ${i}`, checked: false }));
  const { rerender } = render(
    <ImportPreviewList label="Tasks" items={mk(4)} onToggle={() => {}} onSetAll={() => {}} />,
  );
  screen.getAllByRole("checkbox")[3]?.focus();
  rerender(
    <ImportPreviewList label="Tasks" items={mk(2)} onToggle={() => {}} onSetAll={() => {}} />,
  );
  const stops = screen.getAllByRole("checkbox").filter((r) => r.tabIndex === 0);
  expect(stops).toHaveLength(1);
});

test("preview_list_initial_focus_ref_focuses_active_row", () => {
  const ref = createRef<HTMLElement>();
  render(
    <Dialog title="Import tasks" cancelLabel="Cancel" onCancel={() => {}} initialFocusRef={ref}>
      <ImportPreviewList
        ref={ref}
        label="Tasks from Reminders"
        items={items}
        onToggle={() => {}}
        onSetAll={() => {}}
      />
    </Dialog>,
  );
  expect(document.activeElement).toBe(screen.getAllByRole("checkbox")[0]);
});
