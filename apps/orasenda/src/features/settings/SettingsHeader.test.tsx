import { argsOf, mockBackend, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { JumpButton, SECTIONS } from "./SettingsHeader";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

test("jump_button_sends_menu_below_the_button", async () => {
  const backend = mockBackend({ native_menu_popup: () => null });
  render(<JumpButton current="timer" onJump={() => {}} />);
  const button = screen.getByRole("button", { name: "Jump to section" });
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    left: 56,
    bottom: 60,
    top: 16,
    right: 100,
    width: 44,
    height: 44,
    x: 56,
    y: 16,
    toJSON: () => ({}),
  });
  fireEvent.click(button);
  await settle();
  const [call] = argsOf(backend.calls, "native_menu_popup") as {
    request: { items: { id: string; checked: boolean }[]; x: number; y: number };
  }[];
  expect(call?.request.items.map((item) => item.id)).toEqual(SECTIONS.map(({ id }) => id));
  expect(call?.request.items.find((item) => item.checked)?.id).toBe("timer");
  expect({ x: call?.request.x, y: call?.request.y }).toEqual({ x: 56, y: 60 });
});

test("jump_button_reports_the_choice_and_ignores_unknown_ids", async () => {
  const onJump = vi.fn();
  mockBackend({ native_menu_popup: () => "about" });
  render(<JumpButton current="general" onJump={onJump} />);
  fireEvent.click(screen.getByRole("button", { name: "Jump to section" }));
  await settle();
  expect(onJump).toHaveBeenCalledWith("about");

  cleanup();
  const other = vi.fn();
  mockBackend({ native_menu_popup: () => "nope" });
  render(<JumpButton current="general" onJump={other} />);
  fireEvent.click(screen.getByRole("button", { name: "Jump to section" }));
  await settle();
  expect(other).not.toHaveBeenCalled();
});

test("jump_button_logs_a_failed_popup_and_closes", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({
    native_menu_popup: () => {
      throw new Error("no menu");
    },
  });
  render(<JumpButton current="general" onJump={() => {}} />);
  const button = screen.getByRole("button", { name: "Jump to section" });
  fireEvent.click(button);
  await settle();
  expect(error).toHaveBeenCalled();
  expect(button).toHaveAttribute("aria-expanded", "false");
});

test("jump_button_is_expanded_while_the_menu_is_open", async () => {
  let release: (id: string | null) => void = () => {};
  const pending = new Promise<string | null>((resolve) => {
    release = resolve;
  });
  mockBackend({ native_menu_popup: () => pending });
  render(<JumpButton current="general" onJump={() => {}} />);
  const button = screen.getByRole("button", { name: "Jump to section" });
  fireEvent.click(button);
  await settle();
  expect(button).toHaveAttribute("aria-expanded", "true");
  release(null);
  await settle();
  expect(button).toHaveAttribute("aria-expanded", "false");
});
