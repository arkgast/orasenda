import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { events, type SpikeError } from "../bindings";
import { Overlay } from "./Overlay";
import { argsOf, mockBackend, type Replies } from "./testing";

const PLATFORM_ERROR: SpikeError = { kind: "platform", message: "refused" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  await act(async () => {});
  clearMocks();
  vi.restoreAllMocks();
});

/** Renders the overlay and delivers one `overlay-show`, then returns the recorded calls. */
async function showOverlay(choice: Replies[string]) {
  const calls = mockBackend({ spike_overlay_ready: () => null, spike_overlay_choice: choice });
  render(<Overlay />);
  // Let `listen` resolve before emitting.
  await act(async () => {});
  await act(async () => {
    await events.overlayShow.emit({ appName: "Safari" });
  });
  return calls;
}

async function clickBack() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Back to focus" }));
  });
}

test("overlay_choice_resent_after_error_result", async () => {
  // Tauri rejects a command that returns Err, which the bindings turn into status "error".
  const calls = await showOverlay(() => Promise.reject(PLATFORM_ERROR));
  await clickBack();
  await clickBack();
  expect(argsOf(calls, "spike_overlay_choice")).toHaveLength(2);
});

test("overlay_choice_resent_after_thrown_failure", async () => {
  const calls = await showOverlay(() => {
    throw new Error("ipc down");
  });
  await clickBack();
  await clickBack();
  expect(argsOf(calls, "spike_overlay_choice")).toHaveLength(2);
});

test("overlay_choice_ignores_clicks_after_success", async () => {
  const calls = await showOverlay(() => null);
  await clickBack();
  await clickBack();
  expect(argsOf(calls, "spike_overlay_choice")).toHaveLength(1);
});
