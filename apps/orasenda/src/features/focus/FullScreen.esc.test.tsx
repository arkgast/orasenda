import { resetPresetsForTests } from "@domain/presets/presets";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { argsOf, mockBackend, RUNNING, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FocusPage } from "./FocusPage";

beforeEach(() => {
  resetSettingsQueueForTests();
  resetPresetsForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const leaves = (calls: Array<{ cmd: string; args: unknown }>) =>
  calls.filter((call) => call.cmd === "full_screen_leave");

async function open(replies = {}) {
  const backend = mockBackend(replies);
  render(<FocusPage hintsLeft={0} />);
  await settle();
  return backend;
}

test("esc_leaves_without_overlay", async () => {
  const backend = await open({ timer_view: () => RUNNING });
  // Focus is on the page (nothing inside the view has it): Esc still leaves, once.
  const untouched = fireEvent.keyDown(document.body, { key: "Escape" });
  await settle();
  expect(untouched).toBe(false);
  expect(leaves(backend.calls)).toHaveLength(1);
  // Inside the view it leaves once as well, not twice.
  fireEvent.keyDown(screen.getByRole("region", { name: "Full-screen focus" }), { key: "Escape" });
  await settle();
  expect(leaves(backend.calls)).toHaveLength(2);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("the_leave_button_leaves_at_once", async () => {
  const backend = await open();
  fireEvent.click(screen.getByRole("button", { name: "Leave full screen" }));
  await settle();
  expect(leaves(backend.calls)).toHaveLength(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("esc_closes_overlay_only", async () => {
  const backend = await open();
  fireEvent.click(screen.getByRole("button", { name: /^Preset Steady Focus/ }));
  const menu = screen.getByRole("menu");
  fireEvent.keyDown(menu, { key: "Escape" });
  await settle();
  expect(screen.queryByRole("menu")).toBeNull();
  expect(leaves(backend.calls)).toHaveLength(0);
  // With nothing open the next Esc leaves.
  fireEvent.keyDown(document.body, { key: "Escape" });
  await settle();
  expect(leaves(backend.calls)).toHaveLength(1);
});

test("esc_with_a_dialog_open_leaves_it_to_the_dialog", async () => {
  const backend = await open();
  const dialog = document.body.appendChild(document.createElement("div"));
  dialog.setAttribute("role", "dialog");
  fireEvent.keyDown(document.body, { key: "Escape" });
  await settle();
  expect(leaves(backend.calls)).toHaveLength(0);
  dialog.remove();
});

test("a_failed_leave_says_so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const backend = await open({
    full_screen_leave: () => Promise.reject({ kind: "failed", message: "no" }),
  });
  fireEvent.keyDown(document.body, { key: "Escape" });
  await settle();
  expect(argsOf(backend.calls, "full_screen_leave")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Orasenda couldn't leave full screen.");
});
