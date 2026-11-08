import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { events } from "./bindings";
import { Overlay } from "./spike/Overlay";
import { argsOf, type Call, mockBackend } from "./spike/testing";

function overlayBackend(): Call[] {
  return mockBackend({
    spike_overlay_ready: () => null,
    spike_overlay_choice: () => null,
  });
}

async function renderOverlay(): Promise<void> {
  render(
    <StrictMode>
      <Overlay />
    </StrictMode>,
  );
  // Let `listen` resolve and `spike_overlay_ready` go out.
  await act(async () => {});
}

async function show(appName: string): Promise<void> {
  await act(async () => {
    await events.overlayShow.emit({ appName });
  });
}

afterEach(async () => {
  cleanup();
  await act(async () => {});
  clearMocks();
  vi.restoreAllMocks();
});

test("overlay_renders_nothing_before_show", async () => {
  overlayBackend();
  await renderOverlay();

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

test("overlay_calls_ready_on_mount", async () => {
  const calls = overlayBackend();
  await renderOverlay();

  // Once, even under StrictMode's double mount, and only after the listener is attached.
  expect(argsOf(calls, "spike_overlay_ready")).toHaveLength(1);
});

test("overlay_shows_app_name", async () => {
  overlayBackend();
  await renderOverlay();

  await show("Safari");

  expect(screen.getByRole("dialog", { name: "Is this what you intended?" })).toBeInTheDocument();
  expect(screen.getByText(/You opened Safari during a focus session/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Back to focus" })).toBeInTheDocument();
  expect(screen.queryByText(/wait 10 minutes/i)).toBeNull();
});

test("overlay_return_and_escape_send_return", async () => {
  const calls = overlayBackend();
  await renderOverlay();
  await show("Safari");

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Back to focus" }));
  });
  // One choice per show: Escape is checked on the next one.
  await show("Safari");
  await act(async () => {
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  });

  expect(argsOf(calls, "spike_overlay_choice")).toEqual([
    { choice: { kind: "return" } },
    { choice: { kind: "return" } },
  ]);
});

test("overlay_continue_sends_reason_or_null", async () => {
  const calls = overlayBackend();
  await renderOverlay();
  await show("Safari");

  fireEvent.click(screen.getByRole("button", { name: "I need Safari now" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue to Safari" }));
  });
  // One choice per show: the reason is checked on the next one.
  await show("Safari");
  fireEvent.click(screen.getByRole("button", { name: "I need Safari now" }));
  fireEvent.click(screen.getByRole("radio", { name: "Work" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue to Safari" }));
  });

  expect(argsOf(calls, "spike_overlay_choice")).toEqual([
    { choice: { kind: "continue", reason: null } },
    { choice: { kind: "continue", reason: "Work" } },
  ]);
});

test("overlay_second_show_resets_reason", async () => {
  overlayBackend();
  await renderOverlay();
  await show("Safari");
  fireEvent.click(screen.getByRole("button", { name: "I need Safari now" }));
  fireEvent.click(screen.getByRole("radio", { name: "Work" }));
  expect(screen.getByRole("radio", { name: "Work" })).toBeChecked();

  await show("Safari");

  expect(screen.queryByRole("radio", { name: "Work" })).toBeNull();
  expect(screen.getByRole("button", { name: "I need Safari now" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("overlay_second_choice_is_ignored", async () => {
  const calls = overlayBackend();
  await renderOverlay();
  await show("Safari");

  const back = screen.getByRole("button", { name: "Back to focus" });
  await act(async () => {
    fireEvent.click(back);
    fireEvent.click(back);
  });
  expect(argsOf(calls, "spike_overlay_choice")).toHaveLength(1);

  // The next show re-arms the choice.
  await show("Mail");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Back to focus" }));
  });
  expect(argsOf(calls, "spike_overlay_choice")).toHaveLength(2);
});

test("overlay_listen_failure_renders_return_button", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const calls = mockBackend(
    { spike_overlay_ready: () => null, spike_overlay_choice: () => null },
    { failListen: "overlay-show" },
  );
  await renderOverlay();

  expect(screen.getByText("The overlay could not connect.")).toBeInTheDocument();
  const back = screen.getByRole("button", { name: "Back to focus" });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(back).toHaveClass("os-btn");
  expect(back).toHaveFocus();
  expect(argsOf(calls, "spike_overlay_ready")).toHaveLength(0);
  expect(error).toHaveBeenCalled();

  await act(async () => {
    fireEvent.keyDown(document, { key: "Escape" });
  });
  expect(argsOf(calls, "spike_overlay_choice")).toEqual([{ choice: { kind: "return" } }]);
});
