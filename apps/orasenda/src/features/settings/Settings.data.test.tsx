import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { mockBackend, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { openSettings } from "./Settings.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
});

test("about_privacy_line", async () => {
  await openSettings({}, "About");
  expect(screen.getByRole("heading", { level: 2, name: "About" })).toBeInTheDocument();
  expect(
    screen.getByText("Your data stays on this Mac. Orasenda doesn't use the network."),
  ).toBeInTheDocument();
  expect(screen.getByText("Orasenda 0.1.0 for macOS")).toBeInTheDocument();
  expect(screen.getByText(/Mozilla Public License 2\.0/)).toBeInTheDocument();
});

test("data_navigation_target", async () => {
  const { Settings: Page } = await import("./Settings");
  mockBackend();
  render(
    <Page
      info={{ status: "loading" }}
      arrival={{ seq: 1, target: "data" }}
      onNavigate={() => {}}
    />,
  );
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Your data" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Export data…" })).toBeInTheDocument();
});

test("the_pane_has_no_primary_button", async () => {
  const { container } = await openSettings({}, "Your data");
  expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(0);
});
