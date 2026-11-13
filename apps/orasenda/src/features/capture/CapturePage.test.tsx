import { events } from "@shared/ipc/bindings";
import { argsOf, deferred, mockBackend, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { CapturePage } from "./CapturePage";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
});

async function mount(replies: Parameters<typeof mockBackend>[0] = {}) {
  const backend = mockBackend(replies);
  render(
    <StrictMode>
      <CapturePage />
    </StrictMode>,
  );
  await settle();
  return backend;
}

const field = () => screen.getByRole("textbox", { name: "Thought" });
const save = () => screen.getByRole("button", { name: "Save to Inbox" });

test("capture_page_opens_with_the_text_focused_and_internal_chosen", async () => {
  await mount();
  expect(screen.getByRole("dialog", { name: "Capture a thought" })).toBeInTheDocument();
  expect(field()).toHaveFocus();
  expect(screen.getByRole("radio", { name: "Internal" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "External" })).not.toBeChecked();
});

test("capture_page_save_announces_then_closes", async () => {
  const backend = await mount();
  fireEvent.change(field(), { target: { value: "  call the dentist  " } });
  fireEvent.click(screen.getByRole("radio", { name: "External" }));
  fireEvent.click(save());
  await settle();
  // Rust announces "Saved to Inbox." inside capture_note, before it answers; only then does the
  // page ask to close.
  const order = backend.calls
    .map((call) => call.cmd)
    .filter((cmd) => cmd === "capture_note" || cmd === "capture_close");
  expect(order).toEqual(["capture_note", "capture_close"]);
  expect(argsOf(backend.calls, "capture_note")).toEqual([
    { note: { text: "call the dentist", kind: "external" } },
  ]);
});

test("capture_page_does_not_close_before_the_save_answers", async () => {
  const pending = deferred<unknown>();
  const backend = await mount({ capture_note: () => pending.promise });
  fireEvent.change(field(), { target: { value: "wait for me" } });
  fireEvent.click(save());
  await settle();
  expect(argsOf(backend.calls, "capture_close")).toEqual([]);
  expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
});

test("capture_page_failure_keeps_text", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const backend = await mount({
    capture_note: () => {
      throw "Store";
    },
  });
  fireEvent.change(field(), { target: { value: "keep me" } });
  fireEvent.click(save());
  await settle();
  expect(screen.getByText("Your note is still here. Try saving again.")).toBeInTheDocument();
  expect(field()).toHaveValue("keep me");
  expect(argsOf(backend.calls, "capture_close")).toEqual([]);
});

test("capture_page_empty_esc_closes", async () => {
  const backend = await mount();
  fireEvent.keyDown(field(), { key: "Escape" });
  await settle();
  expect(argsOf(backend.calls, "capture_note")).toEqual([]);
  expect(argsOf(backend.calls, "capture_close")).toHaveLength(1);
});

test("capture_page_esc_with_text_saves_it", async () => {
  const backend = await mount();
  fireEvent.change(field(), { target: { value: "esc saves" } });
  fireEvent.keyDown(field(), { key: "Escape" });
  await settle();
  expect(argsOf(backend.calls, "capture_note")).toEqual([
    { note: { text: "esc saves", kind: "internal" } },
  ]);
  expect(argsOf(backend.calls, "capture_close")).toHaveLength(1);
});

test("capture_page_a_second_open_focuses_the_text", async () => {
  const backend = await mount();
  screen.getByRole("radio", { name: "External" }).focus();
  expect(field()).not.toHaveFocus();
  await act(async () => {
    await events.captureFocus.emit();
  });
  expect(backend.listens("capture-focus")).toBeGreaterThan(0);
  expect(field()).toHaveFocus();
});

test("capture_page_the_window_taking_key_focuses_the_text", async () => {
  await mount();
  screen.getByRole("radio", { name: "External" }).focus();
  expect(field()).not.toHaveFocus();
  fireEvent.focus(window);
  expect(field()).toHaveFocus();
});

test("capture_page_follows_the_saved_theme", async () => {
  await mount({ settings_get: () => ({ theme: "dark" }) });
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("capture_page_too_long_says_so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await mount({
    capture_note: () => {
      throw "tooLong";
    },
  });
  fireEvent.change(field(), { target: { value: "long" } });
  fireEvent.click(save());
  await settle();
  expect(
    screen.getByText("This note is too long to save. Shorten it a little."),
  ).toBeInTheDocument();
  expect(field()).toHaveValue("long");
});

test("capture_page_a_failed_close_never_saves_the_note_twice", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const backend = await mount({
    capture_close: () => {
      throw new Error("no window");
    },
  });
  fireEvent.change(field(), { target: { value: "once" } });
  fireEvent.click(save());
  await settle();
  expect(field()).toHaveValue("");
  fireEvent.keyDown(field(), { key: "Escape" });
  await settle();
  expect(argsOf(backend.calls, "capture_note")).toHaveLength(1);
});
