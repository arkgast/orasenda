import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { expect, test, vi } from "vitest";
import { Dialog } from "./dialog";
import { type ImportSource, ImportSourcePicker } from "./import-source-picker";

const sources: ImportSource[] = [
  { kind: "reminders", name: "Reminders", description: "Open reminders on this Mac." },
  {
    kind: "things",
    name: "Things",
    description: "Open to-dos from Things.",
    disabledReason: "Available between sessions, so nothing interrupts your focus.",
  },
  { kind: "todoist", name: "Todoist", description: "A CSV export from Todoist." },
];

test("source_picker_roves_and_picks", () => {
  const onPick = vi.fn();
  render(<ImportSourcePicker sources={sources} onPick={onPick} />);
  const rows = screen.getAllByRole("button");
  expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  expect(rows[0]?.tabIndex).toBe(0);
  rows[0]?.focus();
  fireEvent.keyDown(rows[0] as HTMLElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(rows[1]);
  expect(rows[1]?.tabIndex).toBe(0);
  expect(rows[0]?.tabIndex).toBe(-1);
  fireEvent.keyDown(rows[1] as HTMLElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(rows[2]);
  fireEvent.keyDown(rows[2] as HTMLElement, { key: "ArrowUp" });
  expect(document.activeElement).toBe(rows[1]);
  fireEvent.click(rows[2] as HTMLElement);
  expect(onPick).toHaveBeenCalledWith("todoist");
});

test("source_picker_disabled_reason_described", () => {
  const onPick = vi.fn();
  render(<ImportSourcePicker sources={sources} onPick={onPick} />);
  const row = screen.getByRole("button", { name: "Things" });
  expect(row).toHaveAttribute("aria-disabled", "true");
  expect(row).toHaveAccessibleDescription(/Available between sessions/);
  expect(screen.getByText(/Available between sessions/)).toBeVisible();
  fireEvent.click(row);
  expect(onPick).not.toHaveBeenCalled();
});

test("source_picker_reading_is_busy", () => {
  render(<ImportSourcePicker sources={sources} reading="reminders" onPick={() => {}} />);
  const row = screen.getByRole("button", { name: "Reminders" });
  expect(row).toHaveAttribute("aria-busy", "true");
  expect(row).toHaveTextContent("Reading…");
  expect(screen.getByRole("button", { name: "Todoist" })).not.toHaveAttribute("aria-busy");
});

test("source_picker_reading_blocks_other_rows", () => {
  const onPick = vi.fn();
  render(<ImportSourcePicker sources={sources} reading="reminders" onPick={onPick} />);
  const todoist = screen.getByRole("button", { name: "Todoist" });
  expect(todoist.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(todoist);
  expect(onPick).not.toHaveBeenCalled();
});

test("source_picker_ref_is_the_first_row", () => {
  const ref = createRef<HTMLElement>();
  render(<ImportSourcePicker ref={ref} sources={sources} onPick={() => {}} />);
  expect(ref.current).toBe(screen.getByRole("button", { name: "Reminders" }));
});

test("source_picker_initial_focus_ref_focuses_first_row", () => {
  const ref = createRef<HTMLElement>();
  render(
    <Dialog title="Import tasks" cancelLabel="Cancel" onCancel={() => {}} initialFocusRef={ref}>
      <ImportSourcePicker ref={ref} sources={sources} onPick={() => {}} />
    </Dialog>,
  );
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reminders" }));
});

test("source_picker_click_other_row_while_reading_does_not_pick", () => {
  const onPick = vi.fn();
  render(<ImportSourcePicker sources={sources} reading="reminders" onPick={onPick} />);
  fireEvent.click(screen.getByRole("button", { name: "Todoist" }));
  fireEvent.click(screen.getByRole("button", { name: "Reminders" }));
  expect(onPick).not.toHaveBeenCalled();
});
