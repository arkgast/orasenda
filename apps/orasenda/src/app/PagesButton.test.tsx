import { mockBackend, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PagesButton } from "./PagesButton";
import { onPaletteRequest } from "./palette/paletteRequest";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const NAMES = ["Today", "Board", "Calendar", "Routines", "Review", "Settings", "Commands…"];

function open(answer: string | null, current: "today" | "board" = "board") {
  const backend = mockBackend({ native_menu_popup: () => answer });
  const onNavigate = vi.fn();
  render(<PagesButton current={current} onNavigate={onNavigate} />);
  const button = screen.getByRole("button", { name: "Pages" });
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    left: 12,
    bottom: 56,
    top: 12,
    right: 56,
    width: 44,
    height: 44,
    x: 12,
    y: 12,
    toJSON: () => ({}),
  });
  fireEvent.click(button);
  return { backend, onNavigate };
}

test("pages_button_sends_six_items_current_checked", async () => {
  const { backend } = open(null);
  await settle();
  const call = backend.calls.find((c) => c.cmd === "native_menu_popup");
  const request = (
    (call as { args: unknown }).args as {
      request: { items: Array<Record<string, unknown>>; x: number; y: number };
    }
  ).request;
  expect(request.items.map((i) => i.label)).toEqual(NAMES);
  expect(request.items.map((i) => i.accelerator)).toEqual([
    ...[1, 2, 3, 4, 5, 6].map((n) => `Cmd+${n}`),
    "Cmd+K",
  ]);
  expect(request.items.map((i) => i.checked)).toEqual([
    false,
    true,
    false,
    false,
    false,
    false,
    null,
  ]);
  expect(request.items.map((i) => i.id)).toEqual([
    "today",
    "board",
    "calendar",
    "routines",
    "review",
    "settings",
    "commands",
  ]);
  expect({ x: request.x, y: request.y }).toEqual({ x: 12, y: 56 });
});

test("pages_button_is_a_menu_trigger_with_shortcuts", () => {
  mockBackend();
  render(<PagesButton current="today" onNavigate={() => {}} />);
  const button = screen.getByRole("button", { name: "Pages" });
  expect(button).toHaveAttribute("aria-haspopup", "menu");
  expect(button).toHaveAttribute("aria-keyshortcuts", "Meta+1 Meta+2 Meta+3 Meta+4 Meta+5 Meta+6");
});

test("pages_choice_navigates", async () => {
  const { onNavigate } = open("calendar");
  await settle();
  expect(onNavigate).toHaveBeenCalledWith("calendar");
});

test("pages_dismiss_does_nothing", async () => {
  const { onNavigate } = open(null);
  await settle();
  expect(onNavigate).not.toHaveBeenCalled();
});

test("a_failed_popup_is_logged_and_does_nothing", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const backend = mockBackend({
    native_menu_popup: () => {
      throw new Error("no menu");
    },
  });
  void backend;
  const onNavigate = vi.fn();
  render(<PagesButton current="today" onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole("button", { name: "Pages" }));
  await settle();
  expect(onNavigate).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalled();
});

test("pages_commands_opens_palette", async () => {
  const opened = vi.fn();
  const stop = onPaletteRequest(opened);
  const { onNavigate } = open("commands");
  await settle();
  expect(opened).toHaveBeenCalledTimes(1);
  expect(onNavigate).not.toHaveBeenCalled();
  stop();
});
