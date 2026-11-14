import { resetPresetsForTests } from "@domain/presets/presets";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { emitTimer, mockBackend, PAUSED, RUNNING, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FocusPage } from "./FocusPage";

beforeEach(() => {
  resetSettingsQueueForTests();
  resetPresetsForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const caption = () =>
  document.querySelector<HTMLElement>('[data-slot="full-screen-focus-caption"]');

async function open(hintsLeft: number) {
  mockBackend({ timer_view: () => RUNNING });
  render(<FocusPage hintsLeft={hintsLeft} />);
  await settle();
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

test("hints_first_three_entries", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  for (const left of [3, 2, 1]) {
    await open(left);
    expect(caption(), `entry with ${left} left`).toHaveTextContent("Space pauses · Esc leaves");
    expect(caption()).not.toHaveAttribute("aria-hidden");
    // Still there just before duration-hint (4 s), gone just after.
    await wait(3_999);
    expect(caption()).not.toHaveAttribute("aria-hidden");
    await wait(2);
    expect(caption()).toHaveAttribute("aria-hidden", "true");
    expect(caption()?.className).toContain("opacity-0");
    cleanup();
    await settle();
  }
  // The fourth entry: the row is there for its height, but the hint never shows.
  await open(0);
  expect(caption()).toHaveAttribute("aria-hidden", "true");
});

test("the_hint_row_keeps_its_height_after_it_fades", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await open(3);
  const before = caption();
  await wait(4_001);
  // The same node, faded with opacity: never removed or display:none, so nothing moves.
  expect(caption()).toBe(before);
  expect(caption()?.className).not.toContain("hidden");
  expect(caption()?.textContent).not.toBe("");
});

test("the_hint_follows_the_state_while_it_shows", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await open(3);
  await emitTimer(PAUSED);
  expect(caption()).toHaveTextContent("Space resumes · Esc leaves");
  expect(screen.getByRole("region", { name: "Full-screen focus" })).toBeInTheDocument();
});

test("the_hint_does_not_come_back_on_a_later_render", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await open(3);
  await wait(4_001);
  await emitTimer({ ...RUNNING, remaining: "20:00", remainingLabel: "20 minutes" });
  expect(caption()).toHaveAttribute("aria-hidden", "true");
});
