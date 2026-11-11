import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler, StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../ipc/timerQueue";
import { emitTimer, IDLE, mockBackend, RUNNING, settle } from "../test/fixtures";
import { App } from "./App";

const PAGES = ["Today", "Board", "Calendar", "Routines", "Review", "Settings"];

function strictApp(commits: string[]) {
  return (
    <StrictMode>
      <Profiler id="app" onRender={(_id, phase) => commits.push(phase)}>
        <App />
      </Profiler>
    </StrictMode>
  );
}

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});

afterEach(async () => {
  // Unmount (and unlisten) while the IPC mock is still installed.
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

test("shell_has_no_brand_header", async () => {
  mockBackend();
  const { container } = render(<App />);
  await settle();

  expect(container.querySelector("header")).toBeNull();
  expect(screen.queryByText("Orasenda")).toBeNull();
  expect(screen.queryByText("0.1.0 · macOS aarch64")).toBeNull();
  expect(container.querySelectorAll("main")).toHaveLength(1);
});

test("rejected_app_info_is_logged", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({
    app_info: () => {
      throw new Error("app_info not allowed");
    },
  });
  render(<App />);
  await settle();

  expect(error).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
});

test("compact_has_no_rail_and_pages_choice_navigates_and_focuses_h1", async () => {
  Object.assign(window, { innerWidth: 360, innerHeight: 240 });
  mockBackend({ native_menu_popup: () => "board" });
  render(<App />);
  await settle();
  expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();

  // Today's own top row comes with C4; the Pages button on a placeholder is the way on from there.
  fireEvent.keyDown(document.body, { key: "2", metaKey: true });
  await settle();
  const heading = screen.getByRole("heading", { level: 1, name: "Board" });
  expect(heading).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Pages" }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Board" })).toHaveFocus();

  Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
});

test("cmd_digits_navigate_from_any_page", async () => {
  mockBackend();
  render(<App />);
  await settle();

  fireEvent.keyDown(document.body, { key: "3", metaKey: true });
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toHaveFocus();
  fireEvent.keyDown(document.body, { key: "1", metaKey: true });
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toHaveFocus();
});

test("rail_switches_pages_and_other_pages_render_empty_state", async () => {
  mockBackend();
  render(<App />);
  await settle();
  const rail = screen.getByRole("navigation", { name: "Main navigation" });
  expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");
  expect(rail).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Board" }));
  await settle();

  const heading = screen.getByRole("heading", { level: 1, name: "Board" });
  expect(heading).toHaveFocus();
  expect(screen.getByRole("button", { name: "Board" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "Today" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("heading", { level: 2, name: "Nothing here yet." })).toBeInTheDocument();
  expect(screen.getByText("This comes in a later phase.")).toBeInTheDocument();
  expect(screen.queryByRole("timer")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toHaveFocus();
  expect(screen.getByRole("timer")).toBeInTheDocument();
});

test("first_render_does_not_move_focus", async () => {
  mockBackend();
  render(<App />);
  await settle();

  expect(document.body).toHaveFocus();
});

test("only_one_h1_per_page", async () => {
  mockBackend();
  const { container } = render(<App />);
  await settle();

  for (const page of PAGES) {
    fireEvent.click(screen.getByRole("button", { name: page }));
    await settle();
    const headings = container.querySelectorAll("h1");
    expect(headings, page).toHaveLength(1);
    expect(headings[0], page).toHaveTextContent(page);
  }
});

test("only_one_primary_button_on_today", async () => {
  mockBackend();
  const { container } = render(<App />);
  await settle();

  const primaries = container.querySelectorAll('[data-slot="button"][data-variant="primary"]');
  expect(primaries).toHaveLength(1);
  expect(primaries[0]).toHaveTextContent("Start focus");

  await emitTimer(RUNNING);
  expect(container.querySelectorAll('[data-slot="button"][data-variant="primary"]')).toHaveLength(
    0,
  );
});

test("strict_mode_one_listener_per_event", async () => {
  const backend = mockBackend();
  const commits: string[] = [];
  render(strictApp(commits));
  await settle();

  for (const event of [
    "clock-tick",
    "timer-tick",
    "timer-milestone",
    "navigate",
    "settings-changed",
  ]) {
    expect(backend.live(event), event).toBe(1);
  }

  commits.length = 0;
  await emitTimer(RUNNING);

  expect(commits).toEqual(["update"]);
  expect(screen.getByRole("timer")).toHaveTextContent("24:59");
});

test("tick_to_cleaned_up_subscription_is_ignored", async () => {
  const backend = mockBackend();
  const commits: string[] = [];
  render(strictApp(commits));
  await settle();
  await emitTimer(RUNNING);
  // StrictMode subscribed twice; the first subscription was cleaned up.
  const handlers = backend.handlers("timer-tick");
  expect(handlers).toHaveLength(2);
  const [cleanedUp] = handlers;

  commits.length = 0;
  await act(async () => {
    cleanedUp?.({ event: "timer-tick", id: 0, payload: { ...IDLE } });
  });

  expect(commits).toEqual([]);
  expect(screen.getByRole("timer")).toHaveTextContent("24:59");
});

test("emit_after_unmount_is_ignored", async () => {
  const backend = mockBackend();
  // Unmount before the `listen` promises resolve: the late listeners must be removed too.
  const { unmount } = render(<App />);
  unmount();
  await settle();

  await expect(emitTimer(RUNNING)).resolves.toBeUndefined();
  // `settings-changed` is the save queue's, which outlives every page.
  for (const event of ["clock-tick", "timer-tick", "timer-milestone", "navigate"]) {
    expect(backend.live(event), event).toBe(0);
  }
});

test("enabled_spike_shows_dev_panel", async () => {
  mockBackend({
    spike_status: () => ({ enabled: true, platformSupported: true }),
    spike_running_apps: () => [],
    spike_usage: () => [],
    spike_rule: () => ({ targets: [], action: "hide" }),
  });
  render(<App />);

  expect(await screen.findByRole("group", { name: "Apps to intercept" })).toBeInTheDocument();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
});
