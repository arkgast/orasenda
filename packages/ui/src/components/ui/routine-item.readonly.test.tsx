import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { RoutineItem } from "./routine-item";

function row(container: HTMLElement): Element {
  const el = container.querySelector("[data-slot=routine-item]");
  if (!el) throw new Error("no row");
  return el;
}

test("read_only_done_shows_tick_without_checkbox", () => {
  const { container } = render(<RoutineItem label="Stretch" readOnly done />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  const box = container.querySelector("[data-slot=routine-item-check]");
  expect(box).toHaveClass("bg-break", "border-break");
  expect(box?.querySelector("svg")).toHaveClass("stroke-on-break");
  expect(row(container)).toHaveAttribute("data-state", "done");
  expect(row(container).querySelector("[data-slot=routine-item-label]")?.parentElement).toHaveClass(
    "text-ink-muted",
  );
});

test("read_only_done_is_not_a_tab_stop", () => {
  const { container } = render(<RoutineItem label="Stretch" readOnly done />);
  expect(container.querySelector("button, [tabindex], input")).toBeNull();
});

test("read_only_done_prefix_keeps_detail_and_optional_exposed", () => {
  const { container } = render(
    <RoutineItem label="Stretch" detail="Two minutes" optional readOnly done />,
  );
  const prefix = container.querySelector(".sr-only");
  expect(prefix?.textContent).toBe("Done today: ");
  expect(row(container).textContent).toBe("Done today: StretchOptionalTwo minutes");
  expect(container.querySelector("[data-slot=routine-item-label]")?.closest("[aria-hidden]")).toBeNull();
  expect(container.querySelector("[data-slot=routine-item-detail]")?.closest("[aria-hidden]")).toBeNull();
  expect(screen.getByText("Optional")).toBeVisible();
  expect(screen.getByText("Two minutes")).toBeVisible();
});

test("read_only_skipped_shows_dash_and_word", () => {
  const { container } = render(<RoutineItem label="Stretch" readOnly skipped />);
  expect(row(container)).toHaveAttribute("data-state", "skipped");
  const word = screen.getByText("Skipped");
  expect(word).toHaveClass("text-label", "uppercase", "text-ink-muted");
  expect(word).not.toHaveAttribute("aria-hidden");
  expect(row(container).querySelector(".sr-only")).toBeNull();
  const box = container.querySelector("[data-slot=routine-item-check]");
  expect(box).not.toHaveClass("bg-break");
  expect(box?.querySelector("path")?.getAttribute("d")).toBe("M3 6h6");
});

test("read_only_open_is_a_hollow_box", () => {
  const { container } = render(<RoutineItem label="Stretch" readOnly />);
  expect(row(container)).toHaveAttribute("data-state", "open");
  expect(container.querySelector("[data-slot=routine-item-check] svg")).toBeNull();
  expect(screen.queryByText("Skipped")).toBeNull();
});

test("read_only_done_wins_over_skipped", () => {
  const { container } = render(<RoutineItem label="Stretch" readOnly done skipped />);
  expect(row(container)).toHaveAttribute("data-state", "done");
  expect(screen.queryByText("Skipped")).toBeNull();
  expect(container.querySelector(".sr-only")?.textContent).toBe("Done today: ");
});

test("read_only_fills_width_checkbox_keeps_panel_width", () => {
  const a = render(<RoutineItem label="Stretch" readOnly />);
  expect(row(a.container)).toHaveClass("max-w-full");
  expect(row(a.container)).not.toHaveClass("max-w-panel-width");
  a.unmount();
  render(<RoutineItem label="Stretch" />);
  expect(screen.getByRole("checkbox")).toHaveClass("max-w-panel-width");
});
