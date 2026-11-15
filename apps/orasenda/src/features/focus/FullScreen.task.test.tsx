import { resetPresetsForTests } from "@domain/presets/presets";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { mockBackend, RUNNING, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { FocusPage } from "./FocusPage";

beforeEach(() => {
  resetSettingsQueueForTests();
  resetPresetsForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

test("full_screen_shows_task", async () => {
  mockBackend({
    timer_view: () => ({ ...RUNNING, task: { id: "d1", title: "Fix sync bug" } }),
  });
  render(<FocusPage />);
  await settle();
  expect(screen.getByRole("timer")).toHaveAccessibleName(/Fix sync bug/);
});
