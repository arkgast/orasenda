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
  expect(dialog).toHaveAttribute("data-slot", "dialog-content");
  expect(box).toHaveAttribute("aria-expanded", "true");
  const list = within(dialog).getByRole("listbox", { name: "Commands" });
  expect(within(list).getAllByRole("option")).toHaveLength(3);
});

test("renders_nothing_when_closed", () => {
  render(
    <CommandPalette open={false} commands={commands} onSelect={() => {}} onClose={() => {}} />,
  );
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
  await vi.waitFor(() => expect(box.getAttribute("aria-activedescendant")).toBeTruthy());
  const active = box.getAttribute("aria-activedescendant") as string;
  expect(document.getElementById(active)).toBe(screen.getAllByRole("option")[0]);
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
  const { box } = setup({
    onSelect: (id) => order.push(`select:${id}`),
    onClose: () => order.push("close"),
  });
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
  expect(screen.getByRole("status")).toHaveTextContent(
    "No matching commands. Try a different word.",
  );
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

test("pointer_move_does_not_move_highlight", () => {
  const { box } = setup();
  const before = box.getAttribute("aria-activedescendant");
  const rows = screen.getAllByRole("option");
  fireEvent.pointerMove(rows[2]);
  fireEvent.mouseMove(rows[2]);
  expect(rows[0]).toHaveAttribute("aria-selected", "true");
  expect(rows[2]).toHaveAttribute("aria-selected", "false");
  expect(box.getAttribute("aria-activedescendant")).toBe(before);
});

test("ctrl_k_does_not_move_highlight", () => {
  const { box } = setup();
  fireEvent.keyDown(box, { key: "ArrowDown" });
  const rows = screen.getAllByRole("option");
  expect(rows[1]).toHaveAttribute("aria-selected", "true");
  for (const key of ["k", "j", "n", "p"]) fireEvent.keyDown(box, { key, ctrlKey: true });
  expect(rows[1]).toHaveAttribute("aria-selected", "true");
});

test("home_and_end_keep_moving_the_caret", () => {
  const { box } = setup();
  fireEvent.keyDown(box, { key: "ArrowDown" });
  const rows = screen.getAllByRole("option");
  expect(fireEvent.keyDown(box, { key: "End" })).toBe(true);
  expect(fireEvent.keyDown(box, { key: "Home" })).toBe(true);
  expect(rows[1]).toHaveAttribute("aria-selected", "true");
});

const withShortcuts = [
  { id: "start", label: "Start a session", hint: "Focus on one task", shortcut: "⌃⌥F" },
  { id: "palette", label: "Open commands", shortcut: "⇧⌘P" },
  { id: "plain", label: "Pause" },
];

test("command_palette_shortcut_is_kbd_in_row_name", () => {
  setup({ commands: withShortcuts });
  const row = screen.getByRole("option", { name: /Start a session/ });
  expect(row).toHaveAccessibleName(/Control-Option-F/);
  expect(screen.getByRole("option", { name: /Open commands/ })).toHaveAccessibleName(
    /Shift-Command-P/,
  );
  // The glyphs are drawn, hidden from VoiceOver, and sit in a Kbd on the row's right.
  const kbd = within(row).getByText("⌃⌥F");
  expect(kbd).toHaveAttribute("data-slot", "kbd");
  expect(kbd).toHaveAttribute("aria-hidden", "true");
  expect(within(screen.getByRole("option", { name: "Pause" })).queryByText(/⌃|⌘/)).toBeNull();
  expect(within(row).getByText("Focus on one task")).toBeTruthy();
});

test("command_palette_compact_has_close_icon_button", () => {
  setup({ compact: true });
  const close = screen.getByRole("button", { name: "Close" });
  expect(close).toHaveAttribute("data-slot", "icon-button");
  expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  expect(screen.getByRole("dialog", { name: "Commands" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Search commands" })).toBeTruthy();
  expect(document.querySelector("[data-slot=dialog-title]")?.className).toContain("sr-only");
});

test("command_palette_compact_close_calls_on_close", () => {
  const { onClose } = setup({ compact: true });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("command_palette_list_is_one_tab_stop", () => {
  setup({ commands: withShortcuts, compact: true });
  const dialog = screen.getByRole("dialog", { name: "Commands" });
  const stops = Array.from(
    dialog.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]"),
  ).filter((el) => el.getAttribute("tabindex") !== "-1");
  // The search field is the list's stop; Close is the only other one.
  expect(stops.map((el) => el.getAttribute("aria-label") ?? el.tagName.toLowerCase())).toEqual([
    "input",
    "Close",
  ]);
  for (const row of screen.getAllByRole("option")) expect(row.hasAttribute("tabindex")).toBe(false);
});

test("command_palette_current_props_unchanged", () => {
  setup();
  expect(screen.getAllByRole("option")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("data-slot", "button");
  expect(document.querySelector("[data-slot=kbd]")).toBeNull();
  expect(document.querySelector("[data-slot=dialog-title]")?.className).not.toContain("sr-only");
});

test("command_palette_renders_status", () => {
  setup({ status: "Couldn't pause. Please try again." });
  const line = screen.getByRole("status");
  expect(line).toHaveTextContent("Couldn't pause. Please try again.");
  expect(line.className).not.toMatch(/critical|red/);
});

test("command_palette_keeps_open_when_select_returns_false", async () => {
  const onSelect = vi.fn(() => false);
  const { onClose } = setup({ onSelect });
  fireEvent.click(screen.getAllByRole("option")[0]);
  expect(onSelect).toHaveBeenCalledWith("start");
  expect(onClose).not.toHaveBeenCalled();
});

test("command_palette_waits_for_a_promise_before_closing", async () => {
  let settle: (keep: boolean) => void = () => {};
  const onSelect = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)));
  const { onClose } = setup({ onSelect });
  fireEvent.click(screen.getAllByRole("option")[0]);
  expect(onClose).not.toHaveBeenCalled();
  settle(false);
  await Promise.resolve();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("option")[0]);
  settle(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(onClose).toHaveBeenCalled();
});

test("command_palette_reports_query_changes", () => {
  const onQueryChange = vi.fn();
  const { box } = setup({ onQueryChange });
  fireEvent.change(box, { target: { value: "pa" } });
  expect(onQueryChange).toHaveBeenCalledWith("pa");
});
