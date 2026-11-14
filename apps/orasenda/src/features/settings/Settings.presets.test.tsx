import { resetPresetsForTests } from "@domain/presets/presets";
import type { PresetEntry } from "@shared/ipc/bindings";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import type { Replies } from "@shared/test/fixtures";
import {
  argsOf,
  deferred,
  emitPresetsChanged,
  emitSettingsChanged,
  PRESETS,
  SETTINGS,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { INVALID, openSettings, saveLine, WRITE } from "./Settings.support";

const openIn = (replies: Replies = {}) => openSettings(replies, "Timer");

beforeEach(() => {
  resetPresetsForTests();
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  resetPresetsForTests();
  clearMocks();
  vi.restoreAllMocks();
});

const STEADY = PRESETS[1] as PresetEntry;
const edit = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const updates = (backend: { calls: { cmd: string; args: unknown }[] }) =>
  argsOf(backend.calls, "preset_update");
const ok = (patch: Partial<PresetEntry>) => () => ({ ...STEADY, ...patch });

test("editor_saves_on_blur_and_return", async () => {
  const { backend } = await openIn({ preset_update: ok({ focusMin: 30 }) });
  edit("Steady Focus");
  type("Focus", "30");
  fireEvent.blur(field("Focus"));
  await settle();
  expect(updates(backend)).toEqual([{ id: STEADY.id, patch: { focusMin: 30 } }]);
  expect(saveLine()).toHaveTextContent("Saved. Steady Focus is now 30 / 5, long 15 after 4.");

  type("Break", "10");
  fireEvent.keyDown(field("Break"), { key: "Enter" });
  await settle();
  expect(updates(backend)[1]).toEqual({ id: STEADY.id, patch: { breakMin: 10 } });
  // An unchanged field makes no call.
  await emitPresetsChanged([PRESETS[0] as PresetEntry, { ...STEADY, focusMin: 30, breakMin: 10 }]);
  fireEvent.blur(field("Break"));
  await settle();
  expect(updates(backend)).toHaveLength(2);
});

test("editor_escape_restores", async () => {
  const { backend } = await openIn();
  edit("Steady Focus");
  type("Focus", "400");
  fireEvent.blur(field("Focus"));
  expect(screen.getByText("Between 5 and 180 minutes. Still using 25.")).toBeInTheDocument();
  expect(updates(backend)).toHaveLength(0);
  fireEvent.keyDown(field("Focus"), { key: "Escape" });
  expect(field("Focus").value).toBe("25");
  expect(screen.queryByText(/Still using 25/)).toBeNull();
  // Helpers stay visible.
  expect(screen.getByText("5 to 180 minutes.")).toBeInTheDocument();
});

test("editor_saves_chain_newest_wins", async () => {
  const first = deferred<PresetEntry>();
  const second = deferred<PresetEntry>();
  const holds = [first, second];
  const { backend } = await openIn({ preset_update: () => holds.shift()?.promise });
  edit("Steady Focus");
  type("Focus", "30");
  fireEvent.blur(field("Focus"));
  type("Break", "10");
  fireEvent.blur(field("Break"));
  await settle();
  expect(updates(backend)).toHaveLength(2);
  second.resolve({ ...STEADY, focusMin: 30, breakMin: 10 });
  await settle();
  expect(saveLine()).toHaveTextContent("Saved. Steady Focus is now 30 / 10");
  first.resolve({ ...STEADY, focusMin: 30 });
  await settle();
  expect(saveLine()).toHaveTextContent("Saved. Steady Focus is now 30 / 10");
});

test("presets_changed_from_tray_updates_list", async () => {
  await openIn();
  await emitPresetsChanged([
    { ...STEADY, name: "Morning", focusMin: 40 },
    PRESETS[2] as PresetEntry,
  ]);
  const radios = within(screen.getByRole("group", { name: "Preset library" })).getAllByRole(
    "radio",
  );
  expect(radios).toHaveLength(2);
  expect(radios[0]?.closest("label")).toHaveTextContent(/^Morning$/);
  const cells = within(radios[0]?.closest("tr") as HTMLElement).getAllByRole("cell");
  expect(cells.slice(1, 3).map((c) => c.textContent)).toEqual(["40", "5"]);
});

test("duplicate_and_blank_names_say_so", async () => {
  const { backend } = await openIn({
    preset_update: () => {
      throw { kind: "duplicateName", field: null, message: "taken" };
    },
  });
  edit("Steady Focus");
  type("Name", "   ");
  fireEvent.blur(field("Name"));
  expect(screen.getByText("A name needs at least one letter or number.")).toBeInTheDocument();
  expect(updates(backend)).toHaveLength(0);
  type("Name", "Deep Work");
  fireEvent.blur(field("Name"));
  await settle();
  expect(
    screen.getByText("Another preset has this name. Still using Steady Focus."),
  ).toBeInTheDocument();
});

test("remove_says_the_selection_moved_and_undo_restores", async () => {
  const { backend } = await openIn({
    preset_remove: () => [PRESETS[0], PRESETS[2]],
    preset_undo_remove: () => PRESETS,
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove Steady Focus" }));
  await settle();
  expect(saveLine()).toHaveTextContent("Removed Steady Focus. Gentle Start is selected.");
  fireEvent.click(screen.getByRole("button", { name: "Undo removing Steady Focus" }));
  await settle();
  expect(argsOf(backend.calls, "preset_undo_remove")).toEqual([{ id: STEADY.id }]);
  expect(saveLine()).toHaveTextContent("Brought back Steady Focus.");
});

test("undo_with_a_taken_name_asks_to_rename", async () => {
  await openIn({
    preset_remove: () => [PRESETS[0], PRESETS[2]],
    preset_undo_remove: () => {
      throw { kind: "duplicateName", field: null, message: "taken" };
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove Deep Work" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Undo removing Deep Work" }));
  await settle();
  expect(saveLine()).toHaveTextContent("Another preset has this name now. Rename it first.");
});

test("the_last_preset_cannot_be_removed", async () => {
  const { backend } = await openIn({ presets_list: () => [STEADY] });
  const remove = screen.getByRole("button", { name: "Remove Steady Focus" });
  expect(remove).toBeDisabled();
  expect(screen.getByText("At least one preset stays.")).toBeInTheDocument();
  fireEvent.click(remove);
  await settle();
  expect(argsOf(backend.calls, "preset_remove")).toHaveLength(0);
});

test("add_opens_the_editor_on_name_and_stops_at_twelve", async () => {
  const added = { ...STEADY, id: "new-1", name: "New preset", isDefault: false };
  const { backend } = await openIn({ preset_add: () => added });
  fireEvent.click(screen.getByRole("button", { name: "Add preset" }));
  await settle();
  await emitPresetsChanged([...PRESETS, added]);
  expect(field("Name")).toHaveFocus();
  expect(field("Name").value).toBe("New preset");
  expect(argsOf(backend.calls, "preset_add")).toHaveLength(1);

  const twelve = Array.from({ length: 12 }, (_, i) => ({ ...STEADY, id: `p${i}`, name: `P${i}` }));
  await emitPresetsChanged(twelve);
  const add = screen.getByRole("button", { name: "Add preset" });
  expect(add).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByText("Up to 12 presets.")).toBeInTheDocument();
  fireEvent.click(add);
  await settle();
  expect(argsOf(backend.calls, "preset_add")).toHaveLength(1);
});

test("restore_is_disabled_when_nothing_differs_and_works_when_something_does", async () => {
  const { backend } = await openIn({ presets_restore_defaults: () => PRESETS });
  const restore = () => screen.getByRole("button", { name: "Restore default presets" });
  expect(restore()).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByText("The default presets are all here.")).toBeInTheDocument();

  await emitPresetsChanged([
    { ...STEADY, focusMin: 30, isChanged: true },
    PRESETS[2] as PresetEntry,
  ]);
  expect(restore()).not.toHaveAttribute("aria-disabled", "true");
  fireEvent.click(restore());
  await settle();
  expect(argsOf(backend.calls, "presets_restore_defaults")).toHaveLength(1);
  expect(saveLine()).toHaveTextContent("Default presets restored.");
});

test("a_degraded_store_makes_the_editing_read_only", async () => {
  await openIn({
    timer_state: () => ({ view: { ...(SETTINGS as object), store: "unavailable" }, pending: [] }),
  });
  await emitSettingsChanged(SETTINGS);
  expect(screen.getByRole("button", { name: "Edit Steady Focus" })).toBeDisabled();
});

const later = () => new Promise((resolve) => setTimeout(resolve, 50));

test("a_remove_after_a_settings_failure_shows_removed_with_undo", async () => {
  await openIn({
    settings_set: () => Promise.reject(INVALID),
    preset_remove: () => [PRESETS[0], PRESETS[2]],
  });
  fireEvent.click(screen.getByRole("radio", { name: /Gentle Start/ }));
  await settle();
  expect(saveLine()).not.toHaveTextContent("Removed");
  fireEvent.click(screen.getByRole("button", { name: "Remove Deep Work" }));
  await settle();
  expect(saveLine()).toHaveTextContent("Removed Deep Work.");
  expect(screen.getByRole("button", { name: "Undo removing Deep Work" })).toBeInTheDocument();
});

test("a_failed_action_says_so_and_offers_try_again", async () => {
  const { backend } = await openIn({ preset_remove: () => Promise.reject(WRITE) });
  fireEvent.click(screen.getByRole("button", { name: "Remove Deep Work" }));
  await settle();
  expect(saveLine()).toHaveTextContent("Deep Work wasn't removed.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await settle();
  expect(argsOf(backend.calls, "preset_remove")).toHaveLength(2);
});

test("focus_lands_on_a_control_that_stays", async () => {
  await openIn({
    preset_remove: () => [PRESETS[0], PRESETS[1]],
    preset_undo_remove: () => PRESETS,
  });
  edit("Steady Focus");
  fireEvent.click(screen.getByRole("button", { name: "Done editing Steady Focus" }));
  expect(screen.getByRole("button", { name: "Edit Steady Focus" })).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Remove Deep Work" }));
  await settle();
  await emitPresetsChanged([PRESETS[0] as PresetEntry, STEADY]);
  await later();
  const undo = screen.getByRole("button", { name: "Undo removing Deep Work" });
  expect(undo).toHaveFocus();

  fireEvent.click(undo);
  await settle();
  await emitPresetsChanged(PRESETS as PresetEntry[]);
  await later();
  expect(screen.getByRole("radio", { name: /Deep Work/ })).toHaveFocus();
});

test("edit_button_reports_whether_the_editor_is_open", async () => {
  await openIn();
  const btn = screen.getByRole("button", { name: "Edit Steady Focus" });
  expect(btn).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(btn);
  expect(screen.getByRole("button", { name: "Edit Steady Focus" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});
