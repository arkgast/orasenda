import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { InboxRow, type InboxRowProps } from "./inbox-row";

function setup(over: Partial<InboxRowProps> = {}) {
  const onRemove = vi.fn();
  render(
    <ul>
      <InboxRow
        text="Ask Sam about the invoice"
        kind="internal"
        time="09:41"
        timeLabel="Captured at 9:41 AM"
        onRemove={onRemove}
        removeName="Remove note: Ask Sam about the invoice"
        {...over}
      />
    </ul>,
  );
  return { onRemove };
}

test("inbox_row_kind_is_a_word", () => {
  setup();
  expect(screen.getByText(/^Internal/)).toBeVisible();
  expect(screen.getByRole("listitem")).toHaveTextContent("Internal");
  expect(screen.getByRole("listitem")).toHaveTextContent("09:41");
  expect(screen.getByRole("listitem")).toHaveTextContent("Captured at 9:41 AM");
});

test("inbox_row_external_word", () => {
  setup({ kind: "external" });
  expect(screen.getByText(/^External/)).toBeVisible();
  expect(screen.queryByText(/Internal/)).toBeNull();
});

test("inbox_row_remove_named", () => {
  const { onRemove } = setup();
  const button = screen.getByRole("button", { name: "Remove note: Ask Sam about the invoice" });
  fireEvent.click(button);
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test("inbox_row_text_is_never_truncated", () => {
  const long = "word ".repeat(200).trim();
  setup({ text: long });
  expect(screen.getByText(long)).toBeVisible();
  expect(screen.getByText(long).className).not.toMatch(/truncate|line-clamp|ellipsis/);
});

function withMenu(over: Partial<InboxRowProps> = {}) {
  const onMoveToBoard = vi.fn();
  const kit = setup({ onMoveToBoard, moreName: "More actions for Ask Sam about the invoice", ...over });
  return { onMoveToBoard, ...kit };
}

test("inbox_row_menu_offers_move_to_board", async () => {
  const { onMoveToBoard, onRemove } = withMenu();
  const more = screen.getByRole("button", { name: "More actions for Ask Sam about the invoice" });
  expect(more).toHaveAttribute("aria-haspopup", "menu");
  expect(more).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(more);
  const menu = await screen.findByRole("menu");
  expect(more).toHaveAttribute("aria-expanded", "true");
  expect(more.getAttribute("aria-controls")).toBe(menu.id);
  const items = within(menu)
    .getAllByRole("menuitem")
    .map((i) => i.textContent);
  expect(items).toEqual(["Move to Board", "Remove"]);
  fireEvent.keyDown(within(menu).getByRole("menuitem", { name: "Move to Board" }), { key: "Enter" });
  expect(onMoveToBoard).toHaveBeenCalledTimes(1);
  expect(onRemove).not.toHaveBeenCalled();
});

test("inbox_row_menu_remove_calls_on_remove", async () => {
  const { onRemove } = withMenu();
  fireEvent.click(screen.getByRole("button", { name: /^More actions/ }));
  const menu = await screen.findByRole("menu");
  fireEvent.keyDown(within(menu).getByRole("menuitem", { name: "Remove" }), { key: "Enter" });
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test("inbox_row_without_a_move_handler_keeps_the_remove_button", () => {
  setup();
  expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^Remove note/ })).toBeVisible();
});

test("inbox_row_is_focusable_and_passes_keys_through", () => {
  const onKeyDown = vi.fn();
  setup({ tabIndex: 0, onKeyDown });
  const row = screen.getByRole("listitem");
  expect(row).toHaveAttribute("tabindex", "0");
  row.focus();
  fireEvent.keyDown(row, { key: "ArrowDown" });
  expect(onKeyDown).toHaveBeenCalledTimes(1);
});

test("inbox_row_roving_tabindex_minus_one", () => {
  setup({ tabIndex: -1 });
  expect(screen.getByRole("listitem")).toHaveAttribute("tabindex", "-1");
});

test("inbox_row_without_tabindex_is_not_in_the_tab_order", () => {
  setup();
  expect(screen.getByRole("listitem")).not.toHaveAttribute("tabindex");
});
