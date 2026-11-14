import { KEYBOARD } from "@shared/test/fixtures";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ShortcutRow } from "./ShortcutRow";

afterEach(cleanup);

const START = KEYBOARD.actions[4];

function renderRow(action = START, patch: Partial<Parameters<typeof ShortcutRow>[0]> = {}) {
  const handlers = {
    onSet: vi.fn(),
    onRestore: vi.fn(),
    onConfirm: vi.fn(),
    onPickAnother: vi.fn(),
    onRecordingChange: vi.fn(),
  };
  render(<ShortcutRow action={action} voiceOver={false} errors={{}} {...handlers} {...patch} />);
  return handlers;
}

const row = () => within(screen.getByRole("group", { name: START.label }));

test("status_as_word", () => {
  for (const [status, word] of [
    ["registered", "Registered"],
    ["off", "Off"],
    ["failed", "Not available"],
  ] as const) {
    renderRow({ ...START, global: { ...START.global, status } });
    expect(row().getByText(`Everywhere: ${word}`)).toBeVisible();
    cleanup();
  }
});

test("names_and_description_on_the_left_recorders_named_per_slot", () => {
  renderRow();
  expect(row().getByText(START.description)).toBeVisible();
  expect(row().getByRole("button", { name: /^Start or pause focus, In Orasenda/ })).toBeVisible();
  expect(row().getByRole("button", { name: /^Start or pause focus, Everywhere/ })).toBeVisible();
});

test("repaired_line_shown", () => {
  renderRow({ ...START, app: { ...START.app, repaired: true } });
  expect(
    row().getByText("This shortcut was turned off because another action uses it."),
  ).toBeVisible();
});

test("one_restore_default_for_the_row", () => {
  const { onRestore } = renderRow();
  const buttons = row().getAllByRole("button", { name: "Restore default" });
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);
  expect(onRestore).toHaveBeenCalledTimes(1);
});
