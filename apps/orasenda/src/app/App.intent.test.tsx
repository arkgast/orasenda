import { resetIntentEventsForTests } from "@features/today/intentEvents";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { emitPaletteOpen, emitTimer, mockBackend, RUNNING, settle } from "@shared/test/fixtures";
import { stubPaletteDom } from "@shared/test/paletteDom";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  stubPaletteDom();
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetIntentEventsForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  resetIntentEventsForTests();
  clearMocks();
  vi.restoreAllMocks();
});

async function setIntentFromPalette() {
  await emitPaletteOpen();
  fireEvent.click(screen.getByRole("option", { name: /Set intent/ }));
  // The request is made after the palette has unmounted; let that timer and the reply land.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

test("set_intent_from_another_page_opens_the_field", async () => {
  mockBackend({ timer_view: () => RUNNING, timer_state: () => ({ view: RUNNING, pending: [] }) });
  render(<App />);
  await settle();
  await emitTimer(RUNNING);
  fireEvent.keyDown(document.body, { key: "2", metaKey: true });
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeInTheDocument();
  await setIntentFromPalette();
  expect(screen.getByRole("textbox", { name: "What will be done?" })).toHaveFocus();
});

test("set_intent_with_a_control_focused_keeps_the_field_open", async () => {
  mockBackend({ timer_view: () => RUNNING, timer_state: () => ({ view: RUNNING, pending: [] }) });
  render(<App />);
  await settle();
  await emitTimer(RUNNING);
  screen.getByRole("button", { name: /Pause session/ }).focus();
  await setIntentFromPalette();
  expect(screen.getByRole("textbox", { name: "What will be done?" })).toHaveFocus();
});
