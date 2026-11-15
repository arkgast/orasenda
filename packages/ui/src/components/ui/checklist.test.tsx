import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Checklist } from "./checklist";

const items = [
  { id: "a", text: "Outline", done: true },
  { id: "b", text: "Draft", done: false },
  { id: "c", text: "Edit", done: false },
];

function setup(over: Partial<Parameters<typeof Checklist>[0]> = {}) {
  const fns = { onToggle: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn(), onRename: vi.fn() };
  render(<Checklist label="Checklist" items={items} {...fns} {...over} />);
  return fns;
}

test("checklist_is_a_named_group_with_a_checkbox_per_item", () => {
  const { onToggle } = setup();
  const group = screen.getByRole("group", { name: "Checklist" });
  const boxes = within(group).getAllByRole("checkbox");
  expect(boxes.map((b) => b.getAttribute("aria-label"))).toEqual(["Outline", "Draft", "Edit"]);
  expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, false, false]);
  fireEvent.click(boxes[1] as HTMLElement);
  expect(onToggle).toHaveBeenCalledWith("b");
});

test("checklist_enter_in_the_add_field_adds_and_clears", () => {
  const { onAdd } = setup();
  const field = screen.getByRole("textbox", { name: "Add an item" }) as HTMLInputElement;
  fireEvent.change(field, { target: { value: "  Publish " } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onAdd).toHaveBeenCalledWith("Publish");
  expect(field.value).toBe("");
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onAdd).toHaveBeenCalledTimes(1);
});

test("checklist_backspace_on_an_empty_item_removes_it", () => {
  const { onRemove } = setup();
  const field = screen.getByRole("textbox", { name: "Edit Draft" });
  fireEvent.change(field, { target: { value: "" } });
  fireEvent.keyDown(field, { key: "Backspace" });
  expect(onRemove).toHaveBeenCalledWith("b");
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Edit Outline" }));
});

test("checklist_remove_button_moves_focus_to_a_neighbour", () => {
  setup();
  screen.getByRole("button", { name: "Remove item Draft" }).focus();
  fireEvent.click(screen.getByRole("button", { name: "Remove item Draft" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove item Edit" }));
});

test("checklist_backspace_on_text_does_not_remove", () => {
  const { onRemove } = setup();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit Draft" }), { key: "Backspace" });
  expect(onRemove).not.toHaveBeenCalled();
});

test("checklist_renames_on_enter_and_reverts_an_empty_text_on_blur", () => {
  const { onRename, onRemove } = setup();
  const field = screen.getByRole("textbox", { name: "Edit Draft" }) as HTMLInputElement;
  fireEvent.change(field, { target: { value: "Draft v2" } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onRename).toHaveBeenCalledWith("b", "Draft v2");
  fireEvent.change(field, { target: { value: "" } });
  fireEvent.blur(field);
  expect(field.value).toBe("Draft");
  expect(onRemove).not.toHaveBeenCalled();
});

test("checklist_remove_button_names_the_item", () => {
  const { onRemove } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Remove item Edit" }));
  expect(onRemove).toHaveBeenCalledWith("c");
});

test("checklist_count_is_a_live_status", () => {
  setup();
  expect(screen.getByRole("status")).toHaveTextContent("1 of 3 done");
});

test("checklist_refuses_past_max_with_a_line", () => {
  const { onAdd } = setup({ max: 3 });
  const field = screen.getByRole("textbox", { name: "Add an item" });
  fireEvent.change(field, { target: { value: "More" } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText("A checklist holds up to 3 items.")).toBeTruthy();
  expect((field as HTMLInputElement).value).toBe("More");
});

test("checklist_caps_text_at_200", () => {
  setup();
  expect(screen.getByRole("textbox", { name: "Add an item" })).toHaveAttribute("maxlength", "200");
  expect(screen.getByRole("textbox", { name: "Edit Draft" })).toHaveAttribute("maxlength", "200");
});

test("tab_from_a_remove_button_goes_to_the_next_row_then_the_add_field", () => {
  setup();
  const removes = screen.getAllByRole("button", { name: /^Remove item/ });
  (removes[0] as HTMLElement).focus();
  fireEvent.keyDown(removes[0] as HTMLElement, { key: "Tab" });
  expect(screen.getByRole("checkbox", { name: "Draft" })).toHaveFocus();
  (removes[2] as HTMLElement).focus();
  fireEvent.keyDown(removes[2] as HTMLElement, { key: "Tab" });
  expect(screen.getByRole("textbox", { name: "Add an item" })).toHaveFocus();
});

test("shift_tab_from_a_remove_button_goes_back_to_its_text", () => {
  setup();
  const remove = screen.getByRole("button", { name: "Remove item Draft" });
  remove.focus();
  fireEvent.keyDown(remove, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("textbox", { name: "Edit Draft" })).toHaveFocus();
});
