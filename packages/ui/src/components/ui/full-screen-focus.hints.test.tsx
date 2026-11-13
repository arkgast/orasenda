import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FullScreenFocus } from "./full-screen-focus";

const base = {
  remaining: "18:42",
  remainingLabel: "18 minutes 42 seconds",
  progress: 0.25,
  mode: "focus" as const,
  onLeave: () => {},
};

const row = () =>
  screen
    .getByLabelText("Full-screen focus")
    .querySelector<HTMLElement>("[data-slot=full-screen-focus-caption]") as HTMLElement;

test("full_screen_focus_hint_shows_its_text_while_visible", () => {
  render(<FullScreenFocus {...base} hint={{ text: "Space pauses · Esc leaves", visible: true }} />);
  expect(row()).toHaveTextContent("Space pauses · Esc leaves");
  expect(row().className).not.toContain("opacity-0");
  expect(row().getAttribute("aria-hidden")).toBeNull();
});

test("hint_row_keeps_its_row_after_fading", () => {
  const { rerender } = render(
    <FullScreenFocus {...base} hint={{ text: "Space pauses · Esc leaves", visible: true }} />,
  );
  rerender(
    <FullScreenFocus {...base} hint={{ text: "Space pauses · Esc leaves", visible: false }} />,
  );
  // Still in the layout (not removed, not display:none), only transparent and hidden from readers.
  expect(row()).toBeTruthy();
  expect(row().className).toContain("opacity-0");
  expect(row().className).not.toMatch(/\bhidden\b/);
  expect(row().className).toContain("text-body-sm");
  expect(row().getAttribute("aria-hidden")).toBe("true");
});

test("hint_fades_over_duration_slow", () => {
  render(<FullScreenFocus {...base} hint={{ text: "Space pauses", visible: false }} />);
  expect(row().className).toContain("transition-opacity");
  expect(row().className).toContain("duration-slow");
  expect(row().className).toContain("ease-calm");
});

test("hint_no_fade_reduce_motion", () => {
  render(<FullScreenFocus {...base} hint={{ text: "Space pauses", visible: false }} />);
  expect(row().className).toContain("motion-reduce:transition-none");
});
