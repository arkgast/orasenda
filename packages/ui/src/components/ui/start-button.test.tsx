import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { describeShortcut } from "../../lib/shortcuts";
import { StartButton } from "./start-button";

const noop = () => {};
const props = { onStart: noop, onQuickStart: noop };

test("start_button_name_stays_start_focus_with_compact_label", () => {
  const { container } = render(<StartButton {...props} compactLabel="Start" />);
  expect(screen.getByRole("button", { name: "Start focus" })).toBeTruthy();
  expect(
    container.querySelector("[data-slot=start-button-compact]")?.getAttribute("aria-hidden"),
  ).toBe("true");
  expect(container.querySelector("[data-slot=start-button-full]")?.textContent).toBe("Start focus");
});

test("start_button_keyshortcuts_follow_single_keys", () => {
  const both = `${describeShortcut("Space").aria} ${describeShortcut("⌘↩").aria}`;
  const { rerender } = render(<StartButton {...props} singleKeys />);
  expect(
    screen.getByRole("button", { name: "Start focus" }).getAttribute("aria-keyshortcuts"),
  ).toBe("Space Meta+Enter");
  expect(both).toBe("Space Meta+Enter");
  rerender(<StartButton {...props} singleKeys={false} />);
  expect(
    screen.getByRole("button", { name: "Start focus" }).getAttribute("aria-keyshortcuts"),
  ).toBe(describeShortcut("⌘↩").aria);
  expect(
    screen.getByRole("button", { name: "Just 2 minutes" }).hasAttribute("aria-keyshortcuts"),
  ).toBe(false);
});

test("start_button_without_single_keys_prop_matches_current_output", () => {
  const { container } = render(<StartButton {...props} finishTime="15:20" loading={false} />);
  expect(container.querySelector("[aria-keyshortcuts]")).toBeNull();
  expect(screen.getByRole("button", { name: "Start focus" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Just 2 minutes" })).toBeTruthy();
});

test("start_button_unavailable_stays_focusable", () => {
  const onStart = vi.fn();
  const onQuickStart = vi.fn();
  const { container } = render(
    <StartButton onStart={onStart} onQuickStart={onQuickStart} unavailable />,
  );
  for (const name of ["Start focus", "Just 2 minutes"]) {
    const b = screen.getByRole("button", { name });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect((b as HTMLButtonElement).disabled).toBe(false);
    b.focus();
    expect(b).toHaveFocus();
    fireEvent.click(b);
  }
  expect(onStart).not.toHaveBeenCalled();
  expect(onQuickStart).not.toHaveBeenCalled();
  expect(container.querySelector("[role=status],[role=alert],[aria-live]")).toBeNull();
});

test("start_button_finish_time_still_renders_realistic_finish", () => {
  const { container } = render(<StartButton {...props} finishTime="15:20" />);
  expect(container.textContent).toContain("Realistic finish · 15:20");
});

test("start_button_disabled_still_disables", () => {
  render(<StartButton {...props} disabled />);
  for (const b of screen.getAllByRole("button"))
    expect((b as HTMLButtonElement).disabled).toBe(true);
});

test("start_button_play_glyph_hidden", () => {
  render(<StartButton {...props} />);
  const start = screen.getByRole("button", { name: "Start focus" });
  expect(start.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("start_button_loading_reads_starting", () => {
  render(<StartButton {...props} loading />);
  expect(screen.getByRole("button", { name: "Starting…" })).toBeTruthy();
});

test("exposes_two_buttons_with_names", () => {
  render(<StartButton {...props} />);
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Start focus",
    "Just 2 minutes",
  ]);
});

test("loading_guards_both_buttons_and_marks_busy", () => {
  const onQuickStart = vi.fn();
  render(<StartButton onStart={noop} onQuickStart={onQuickStart} loading />);
  expect(screen.getByRole("button", { name: "Starting…" }).getAttribute("aria-busy")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Just 2 minutes" }));
  expect(onQuickStart).not.toHaveBeenCalled();
});
