import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { DEEP, SETTINGS, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetPresetsForTests } from "../today/presets";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { openSettings, saveLine, sets } from "./Settings.support";

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

const caps = () =>
  screen.getAllByRole("radio").filter((r) => r.getAttribute("name") === "extension-cap");
const cap = (label: string) => caps().find((r) => r.closest("label")?.textContent === label);

test("extension_cap_radios_save", async () => {
  const { backend } = await openSettings();
  expect(caps().map((r) => r.closest("label")?.textContent)).toEqual([
    "Off",
    "Once",
    "Twice",
    "3 times",
  ]);
  expect(cap("Twice")).toBeChecked();
  fireEvent.click(cap("3 times") as HTMLElement);
  await settle();
  expect(sets(backend).at(-1)?.settings.extensionCap).toBe(3);
  expect(saveLine()).toHaveTextContent("Extra 10 minutes: 3 times.");
  fireEvent.click(cap("Off") as HTMLElement);
  await settle();
  expect(sets(backend).at(-1)?.settings.extensionCap).toBe(0);
  expect(saveLine()).toHaveTextContent("Extra 10 minutes: off.");
});

test("longest_focus_helper_when_preset_reaches_it", async () => {
  await openSettings();
  const longest = screen.getByLabelText("Longest focus");
  expect(document.getElementById(longest.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
    "Steps stop here and the break starts.",
  );
  cleanup();
  await settle();
  clearMocks();
  resetSettingsQueueForTests();
  resetTimerQueueForTests();
  await openSettings({ settings_get: () => ({ ...SETTINGS, presetId: DEEP }) });
  const reached = screen.getByLabelText("Longest focus");
  expect(document.getElementById(reached.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
    "Deep Work already reaches this, so no steps are added.",
  );
});

test("auto_continue_and_longest_focus_save", async () => {
  const { backend } = await openSettings();
  fireEvent.click(screen.getByRole("checkbox", { name: "Keep going automatically" }));
  await settle();
  expect(sets(backend).at(-1)?.settings.autoContinue).toBe(true);
  expect(saveLine()).toHaveTextContent("Keep going automatically: on.");
  const longest = screen.getByLabelText("Longest focus");
  fireEvent.change(longest, { target: { value: "200" } });
  fireEvent.blur(longest);
  await settle();
  expect(screen.getByText("Between 60 and 150 minutes. Still using 90.")).toBeInTheDocument();
  expect(sets(backend).filter((s) => s.settings.longestFocusMin !== 90)).toHaveLength(0);
  fireEvent.change(longest, { target: { value: "120" } });
  fireEvent.keyDown(longest, { key: "Enter" });
  await settle();
  expect(sets(backend).at(-1)?.settings.longestFocusMin).toBe(120);
  expect(saveLine()).toHaveTextContent("Longest focus: 120 minutes.");
});

test("deep_hours_cap_saves", async () => {
  const { backend } = await openSettings();
  const hours = screen.getByLabelText("Hours");
  fireEvent.change(hours, { target: { value: "1" } });
  fireEvent.blur(hours);
  await settle();
  expect(screen.getByText("Between 2 and 8 hours. Still using 4.")).toBeInTheDocument();
  fireEvent.change(hours, { target: { value: "6" } });
  fireEvent.blur(hours);
  await settle();
  expect(sets(backend).at(-1)?.settings.deepCapHours).toBe(6);
  fireEvent.click(screen.getByRole("checkbox", { name: "Note when today's focus passes" }));
  await settle();
  expect(sets(backend).at(-1)?.settings.deepCapOn).toBe(false);
});

test("break_suggestions_carry_the_wellness_note", async () => {
  await openSettings();
  expect(
    screen.getAllByRole("note").some((n) => /not medical advice/.test(n.textContent ?? "")),
  ).toBe(true);
});
