import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { argsOf, KEYBOARD, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderToday } from "./Today.support";

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

const withoutSpace = {
  ...KEYBOARD,
  actions: KEYBOARD.actions.map((a) => (a.id === "startPause" ? { ...a, singleKey: null } : a)),
};

test("single_keys_from_registry", async () => {
  const { backend } = await renderToday();
  fireEvent.keyDown(document.body, { key: " ", code: "Space" });
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toHaveLength(1);
});

test("single_keys_from_registry_none_means_no_space", async () => {
  const { backend } = await renderToday({ keyboard_state: () => withoutSpace });
  fireEvent.keyDown(document.body, { key: " ", code: "Space" });
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toHaveLength(0);
});
