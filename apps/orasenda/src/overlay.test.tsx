import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { events, type SpikeError } from "./bindings";
import { Overlay } from "./spike/Overlay";
import { argsOf, type Call, mockBackend } from "./spike/testing";

function overlayBackend(choice: () => unknown = () => null): Call[] {
  return mockBackend({
    spike_overlay_ready: () => null,
    spike_overlay_choice: choice,
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

/** Shows the prompt for `appName` and opens step 2 with "I need <app> now". */
async function showReasons(appName: string): Promise<void> {
  await show(appName);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: `I need ${appName} now` }));
  });
}

test("overlay_step_one_has_back_to_focus_as_only_primary", async () => {
  overlayBackend();
  await renderOverlay();
  await show("Safari");

  const back = screen.getByRole("button", { name: "Back to focus" });
  const need = screen.getByRole("button", { name: "I need Safari now" });
  expect(screen.getAllByRole("button")).toEqual([back, need]);
  expect(back).toHaveClass("os-btn-primary");
  expect(need).not.toHaveClass("os-btn-primary");
  expect(back).toHaveFocus();
  expect(need).not.toHaveAttribute("aria-expanded");
  expect(screen.queryByRole("radio")).toBeNull();
});

test("overlay_step_two_shows_only_reasons_continue_and_back", async () => {
  overlayBackend();
  await renderOverlay();
  await showReasons("Safari");

  const continueButton = screen.getByRole("button", { name: "Continue to Safari" });
  const back = screen.getByRole("button", { name: "Back to focus" });
  expect(screen.getAllByRole("button")).toEqual([continueButton, back]);
  expect(back).toHaveClass("os-btn-primary");
  expect(continueButton).not.toHaveClass("os-btn-primary");
  expect(screen.getByRole("group", { name: "What do you need Safari for?" })).toBeInTheDocument();
  const radios = screen.getAllByRole("radio");
  expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
    "Work",
    "Quick check",
    "Other",
  ]);
  expect(radios.some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
  expect(radios[0]).toHaveFocus();
});

test("overlay_continue_without_reason_is_unavailable_and_sends_nothing", async () => {
  const calls = overlayBackend();
  await renderOverlay();
  await showReasons("Safari");

  const continueButton = screen.getByRole("button", { name: "Continue to Safari" });
  expect(continueButton).toHaveAttribute("aria-disabled", "true");
  expect(continueButton).toHaveAccessibleDescription(
    "Pick one to continue. Your reason stays on this device.",
  );
  await act(async () => {
    fireEvent.click(continueButton);
  });

  expect(argsOf(calls, "spike_overlay_choice")).toEqual([]);
});

test("overlay_continue_sends_picked_reason", async () => {
  const calls = overlayBackend();
  await renderOverlay();
  await showReasons("Safari");

  // Clicking Continue before a reason sends nothing and does not use up the show's one choice.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue to Safari" }));
  });
  fireEvent.click(screen.getByRole("radio", { name: "Quick check" }));
  const continueButton = screen.getByRole("button", { name: "Continue to Safari" });
  expect(continueButton).not.toHaveAttribute("aria-disabled");
  expect(continueButton).not.toHaveAttribute("aria-describedby");
  await act(async () => {
    fireEvent.click(continueButton);
  });

  expect(argsOf(calls, "spike_overlay_choice")).toEqual([
    { choice: { kind: "continue", reason: "Quick check" } },
  ]);
});

test("overlay_escape_on_step_two_sends_return", async () => {
  const calls = overlayBackend();
  await renderOverlay();
  await showReasons("Safari");
  fireEvent.click(screen.getByRole("radio", { name: "Work" }));

  await act(async () => {
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  });

  expect(argsOf(calls, "spike_overlay_choice")).toEqual([{ choice: { kind: "return" } }]);
});

test("overlay_second_show_resets_to_step_one", async () => {
  overlayBackend();
  await renderOverlay();
  await showReasons("Safari");
  fireEvent.click(screen.getByRole("radio", { name: "Work" }));
  expect(screen.getByRole("radio", { name: "Work" })).toBeChecked();

  await show("Safari");

  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByRole("button", { name: "Continue to Safari" })).toBeNull();
  expect(screen.getByRole("button", { name: "Back to focus" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "I need Safari now" })).not.toHaveAttribute(
    "aria-expanded",
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

const PLATFORM_ERROR: SpikeError = { kind: "platform", message: "refused" };

async function clickBack(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Back to focus" }));
  });
}

test("overlay_choice_resent_after_error_result", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Tauri rejects a command that returns Err, which the bindings turn into status "error".
  const calls = overlayBackend(() => Promise.reject(PLATFORM_ERROR));
  await renderOverlay();
  await show("Safari");

  await clickBack();
  // The window may still cover the screen: Escape must be able to try again.
  await act(async () => {
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  });

  expect(argsOf(calls, "spike_overlay_choice")).toHaveLength(2);
});

test("overlay_choice_resent_after_thrown_failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const calls = overlayBackend(() => {
    throw new Error("ipc down");
  });
  await renderOverlay();
  await show("Safari");

  await clickBack();
  await clickBack();

  expect(argsOf(calls, "spike_overlay_choice")).toHaveLength(2);
});

test("overlay_choice_ignores_clicks_after_success", async () => {
  const calls = overlayBackend();
  await renderOverlay();
  await show("Safari");

  await clickBack();
  await clickBack();

  expect(argsOf(calls, "spike_overlay_choice")).toHaveLength(1);
});

test("overlay_late_failure_of_earlier_show_does_not_rearm_choice", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let rejectFirst: (error: SpikeError) => void = () => {};
  let replies = 0;
  const calls = overlayBackend(() => {
    replies += 1;
    if (replies > 1) return null;
    return new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });
  });
  await renderOverlay();
  await show("Safari");
  await clickBack();
  await show("Mail");
  await clickBack();

  await act(async () => {
    rejectFirst(PLATFORM_ERROR);
  });
  await clickBack();

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
