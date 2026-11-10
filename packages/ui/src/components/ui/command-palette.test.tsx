import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, expect, test, vi } from "vitest";
import { CommandPalette } from "./command-palette";

beforeAll(() => {
  // jsdom has neither; cmdk scrolls the highlighted row into view.
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const commands = [
  { id: "start", label: "Start a session", hint: "Focus on one task" },
  { id: "pause", label: "Pause" },
  { id: "end", label: "End session" },
];

function setup(over: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<CommandPalette commands={commands} onSelect={onSelect} onClose={onClose} {...over} />);
  return { onSelect, onClose, box: screen.getByRole("combobox", { name: "Search commands" }) };
}

test("exposes_dialog_combobox_and_listbox_with_name", () => {
  const { box } = setup();
  const dialog = screen.getByRole("dialog", { name: "Commands" });
  expect(dialog).toHaveAttribute("data-slot", "command-palette");
  expect(box).toHaveAttribute("aria-expanded", "true");
  const list = within(dialog).getByRole("listbox", { name: "Commands" });
  expect(within(list).getAllByRole("option")).toHaveLength(3);
});

test("renders_nothing_when_closed", () => {
  setup({ open: false });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("renders_selected_row_with_word_and_aria_selected", () => {
  setup();
  const first = screen.getAllByRole("option")[0];
  expect(first).toHaveAttribute("aria-selected", "true");
  expect(within(first).getByText("Selected")).toBeTruthy();
  expect(screen.getAllByText("Selected")).toHaveLength(1);
  expect(within(first).getByText("Focus on one task")).toBeTruthy();
});

test("search_field_takes_focus_and_points_at_active_option", async () => {
  const { box } = setup();
  await vi.waitFor(() => expect(document.activeElement).toBe(box));
  const active = box.getAttribute("aria-activedescendant");
  expect(active).toBeTruthy();
  expect(document.getElementById(active as string)).toBe(screen.getAllByRole("option")[0]);
});

test("arrows_wrap_through_results", () => {
  const { box } = setup();
  const selected = () => screen.getByRole("option", { selected: true });
  fireEvent.keyDown(box, { key: "ArrowDown" });
  expect(selected()).toHaveTextContent("Pause");
  fireEvent.keyDown(box, { key: "ArrowUp" });
  fireEvent.keyDown(box, { key: "ArrowUp" });
  expect(selected()).toHaveTextContent("End session");
  fireEvent.keyDown(box, { key: "ArrowDown" });
  expect(selected()).toHaveTextContent("Start a session");
});

test("enter_runs_highlighted_command_then_closes", () => {
  const order: string[] = [];
  const { box } = setup({ onSelect: (id) => order.push(`select:${id}`), onClose: () => order.push("close") });
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(order).toEqual(["select:pause", "close"]);
});

test("click_runs_command", () => {
  const { onSelect, onClose } = setup();
  fireEvent.click(screen.getByRole("option", { name: /End session/ }));
  expect(onSelect).toHaveBeenCalledWith("end");
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("typing_filters_by_label_and_hint", () => {
  const { box } = setup();
  fireEvent.change(box, { target: { value: "one task" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option")).toHaveTextContent("Start a session");
  fireEvent.change(box, { target: { value: "  PAUSE " } });
  expect(screen.getByRole("option")).toHaveTextContent("Pause");
});

test("no_match_shows_status_and_no_active_descendant", () => {
  const { box, onSelect } = setup();
  fireEvent.change(box, { target: { value: "zzz" } });
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(screen.getByRole("status")).toHaveTextContent("No matching commands. Try a different word.");
  expect(box).not.toHaveAttribute("aria-activedescendant");
  fireEvent.keyDown(box, { key: "Enter" });
  expect(onSelect).not.toHaveBeenCalled();
});

test("keys_during_composition_are_ignored", () => {
  const { box, onSelect } = setup();
  fireEvent.keyDown(box, { key: "ArrowDown", isComposing: true });
  expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Start a session");
  fireEvent.keyDown(box, { key: "Enter", isComposing: true });
  fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
  expect(onSelect).not.toHaveBeenCalled();
});

test("escape_and_close_button_call_on_close", () => {
  const { onClose, onSelect, box } = setup();
  fireEvent.keyDown(box, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(onSelect).not.toHaveBeenCalled();
});

test("backdrop_click_never_dismisses", () => {
  const { onClose } = setup();
  const overlay = document.querySelector("[data-slot=dialog-overlay]") as HTMLElement;
  fireEvent.pointerDown(overlay);
  fireEvent.click(overlay);
  expect(onClose).not.toHaveBeenCalled();
});
