import { fireEvent, render, screen } from "@testing-library/react";
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
