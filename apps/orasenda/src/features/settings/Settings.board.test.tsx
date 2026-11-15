import { SETTINGS, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { openSettings, sets } from "./Settings.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("buffer_row_saves", async () => {
  const { backend } = await openSettings({}, "Timer");
  const select = screen.getByRole("combobox", { name: "Estimate buffer" });
  expect(select).toHaveValue("25");
  expect(
    screen.getByText("Padding for the planning fallacy. Your estimates stay as you wrote them."),
  ).toBeInTheDocument();
  expect(
    within(select)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["25%", "30%", "35%", "40%", "45%", "50%"]);
  fireEvent.change(select, { target: { value: "40" } });
  await settle();
  expect(sets(backend).at(-1)?.settings.boardEstimateBuffer).toBe(40);
});

test("shortcuts_lists_board_keys", async () => {
  await openSettings({}, "Shortcuts");
  expect(
    screen.getByRole("checkbox", { name: "Use single keys (Space, P, F, B)" }),
  ).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "On the Board" });
  const rows = within(table)
    .getAllByRole("row")
    .map((row) => row.textContent ?? "");
  expect(rows.slice(1)).toEqual([
    "Add task⌘NCommand-N",
    "Move to another column⌥⌘←⌥⌘→Option-Command-Left Arrow, Option-Command-Right Arrow",
    "Reorder in a column⌥⌘↑⌥⌘↓Option-Command-Up Arrow, Option-Command-Down Arrow",
    "Remove task⌘⌫Command-Delete",
    "Make FrogFF key",
    "Open task↩Return",
    "Start focus on task⌘↩Command-Return",
    "Move note to Board (Inbox)BB key",
  ]);
});

test("shortcuts_board_keys_read_off_when_single_keys_are_off", async () => {
  await openSettings({ settings_get: () => ({ ...SETTINGS, singleKey: false }) }, "Shortcuts");
  const table = screen.getByRole("table", { name: "On the Board" });
  const row = (action: string) => within(table).getByRole("row", { name: new RegExp(action) });
  expect(row("Make Frog")).toHaveTextContent(/Off$/);
  expect(row("Move note to Board")).toHaveTextContent(/Off$/);
  expect(row("Add task")).not.toHaveTextContent(/Off$/);
});
