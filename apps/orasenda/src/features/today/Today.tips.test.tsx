import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { argsOf, emitMilestone, emitTimer, IDLE, RUNNING, settle } from "../../test/fixtures";
import { renderToday, statusNodes } from "./Today.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const SHORTCUT = "Tip: ⌃⌥F starts or pauses focus from anywhere.";
const TIPPED = { ...IDLE, tip: "globalShortcut" as const };

/** The visible line and the spoken one: the live region holds both. */
function line(): { shown: string; spoken: string } {
  const [node] = statusNodes();
  const shown = node.querySelector('[aria-hidden="true"]')?.textContent ?? node.textContent ?? "";
  const spoken = node.querySelector(".sr-only")?.textContent ?? shown;
  return { shown, spoken };
}

test("welcome_line_shows_when_the_view_says_so_and_ends_at_start", async () => {
  await renderToday({ timer_state: () => ({ view: { ...IDLE, welcome: true }, pending: [] }) });
  expect(statusNodes()[0]).toHaveTextContent("Welcome. Nothing to set up.");
  await emitTimer(RUNNING);
  expect(statusNodes()).toHaveLength(0);
});

test("tip_joins_session_ended_with_got_it_and_spoken_keys", async () => {
  const { backend } = await renderToday();
  await emitMilestone({ kind: "ended", endReason: "completed", phase: "focus" });
  await emitTimer(TIPPED);
  expect(line().shown).toBe(`Session ended. ${SHORTCUT}`);
  expect(line().spoken).toBe(
    "Session ended. Tip: Control-Option-F starts or pauses focus from anywhere.",
  );
  expect(SHORTCUT.length).toBeLessThanOrEqual(65);
  expect(argsOf(backend.calls, "tip_seen")).toEqual([{ tip: "globalShortcut", how: "shown" }]);
});

test("tip_alone_after_the_row_is_empty_and_reported_once", async () => {
  const { backend } = await renderToday();
  await emitTimer(TIPPED);
  expect(line().shown).toBe(SHORTCUT);
  await emitTimer(TIPPED);
  expect(argsOf(backend.calls, "tip_seen")).toHaveLength(1);
});

test("second_showing_keeps_the_line_for_this_visit", async () => {
  await renderToday();
  await emitTimer(TIPPED);
  // The report answered a view without the tip: it stays up until the next start.
  await emitTimer(IDLE);
  expect(line().shown).toBe(SHORTCUT);
  await emitTimer(RUNNING);
  await emitTimer(IDLE);
  expect(statusNodes()).toHaveLength(0);
});

test("got_it_keeps_session_ended", async () => {
  const { backend } = await renderToday();
  await emitMilestone({ kind: "ended", endReason: "completed", phase: "focus" });
  await emitTimer(TIPPED);
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(statusNodes()[0]).toHaveTextContent(/^Session ended\.$/);
  expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
  expect(argsOf(backend.calls, "tip_seen")).toContainEqual({ tip: "globalShortcut", how: "gotIt" });
  // The view that still carries the tip does not bring it back.
  await emitTimer(TIPPED);
  expect(statusNodes()[0]).toHaveTextContent(/^Session ended\.$/);
});

test("tip_not_reported_while_another_line_outranks_it", async () => {
  const { backend } = await renderToday();
  await emitMilestone({ kind: "recovered", endReason: null, phase: "focus" });
  await emitTimer(TIPPED);
  expect(statusNodes()[0]).toHaveTextContent("Your last session ended while Orasenda was closed.");
  expect(argsOf(backend.calls, "tip_seen")).toHaveLength(0);
});

test("menu_and_focus_view_tips_use_the_spec_copy", async () => {
  await renderToday();
  await emitTimer({ ...IDLE, tip: "globalShortcutMenu" });
  expect(line().shown).toBe("Tip: The menu bar item starts focus from anywhere.");
  await emitTimer(RUNNING);
  await emitTimer({ ...IDLE, tip: "focusViewKeys" });
  expect(line().shown).toBe("Tip: F key opens Focus view, full screen or floating.");
  await emitTimer(RUNNING);
  await emitTimer({ ...IDLE, tip: "focusView" });
  expect(line().shown).toBe("Tip: ⇧⌘F opens full screen, ⇧⌘T the floating timer.");
  expect(line().spoken).toBe(
    "Tip: Shift-Command-F opens full screen, Shift-Command-T the floating timer.",
  );
});
