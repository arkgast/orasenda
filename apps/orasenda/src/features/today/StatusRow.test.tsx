import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { StatusRow } from "./StatusRow";
import type { StatusLine } from "./statusLine";

afterEach(cleanup);

const BREAK_LINE: StatusLine = {
  text: "Optional: look at something far away.",
  tone: "neutral",
  actions: [
    { id: "extend", label: "+10 min", name: "Back to focus for 10 more minutes", variant: "quiet" },
    { id: "skipBreak", label: "Skip break", variant: "ghost" },
  ],
};

test("status_row_two_actions_names", () => {
  const onAction = vi.fn();
  render(<StatusRow line={BREAK_LINE} onAction={onAction} />);

  expect(screen.getByRole("status")).toHaveTextContent("Optional: look at something far away.");
  const first = screen.getByRole("button", { name: "Back to focus for 10 more minutes" });
  const second = screen.getByRole("button", { name: "Skip break" });
  expect(first).toHaveTextContent("+10 min");
  // The first action is the notice's own, the second a sibling button, in reading order.
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("status")).not.toContainElement(second);

  fireEvent.click(first);
  fireEvent.click(second);
  expect(onAction.mock.calls.map(([id]) => id)).toEqual(["extend", "skipBreak"]);
});

test("status_row_empty_line_keeps_the_live_region_mounted", () => {
  render(<StatusRow line={null} onAction={() => {}} />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(screen.queryByRole("button")).toBeNull();
});

test("status_row_a_new_text_is_a_new_live_node", () => {
  const { rerender } = render(<StatusRow line={BREAK_LINE} onAction={() => {}} />);
  const node = screen.getByRole("status");
  rerender(
    <StatusRow line={{ ...BREAK_LINE, text: "Walk to another room." }} onAction={() => {}} />,
  );
  expect(screen.getByRole("status")).not.toBe(node);
});
