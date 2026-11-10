import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { ModeChip } from "./mode-chip";

const SHAPE = {
  focus: "circle[r='5']",
  break: "path[d^='M5 0a5']",
  routine: "rect",
  warning: "path[d^='M5 0.5']",
  shallow: "circle[fill='none']",
  paused: "path[d^='M1 1h3']",
  idle: "circle[fill='none']",
} as const;

const WORDS = [
  ["focus", "Focus"],
  ["break", "Break"],
  ["routine", "Routine"],
  ["warning", "Almost up"],
  ["shallow", "Shallow"],
  ["paused", "Paused"],
  ["idle", "No session"],
] as const;

test.each(WORDS)("renders_%s_with_word_or_shape", (mode, word) => {
  const { container } = render(<ModeChip mode={mode} />);
  const chip = container.querySelector('[data-slot="mode-chip"]') as HTMLElement;
  expect(chip.textContent).toBe(word);
  expect(chip.getAttribute("data-mode")).toBe(mode);
  const shape = chip.querySelector("svg");
  expect(shape?.getAttribute("aria-hidden")).toBe("true");
  expect(shape?.querySelector(SHAPE[mode])).not.toBeNull();
});

test.each(["shallow", "paused", "idle"] as const)("%s_has_inset_ring_outline", (mode) => {
  const { container } = render(<ModeChip mode={mode} />);
  const cls = container.querySelector('[data-slot="mode-chip"]')?.className ?? "";
  expect(cls).toContain("inset-ring");
  expect(cls).toContain("inset-ring-line-strong");
});

test("warning_uses_amber_soft_tint", () => {
  const { container } = render(<ModeChip mode="warning" />);
  const cls = container.querySelector('[data-slot="mode-chip"]')?.className ?? "";
  expect(cls).toContain("bg-amber-soft");
  expect(cls).toContain("text-amber");
});

test.each(WORDS)("%s_keeps_label_style_beside_tint", (mode) => {
  const { container } = render(<ModeChip mode={mode} />);
  const cls = (container.querySelector('[data-slot="mode-chip"]')?.className ?? "").split(" ");
  expect(cls).toContain("text-label");
});

test("defaults_to_focus", () => {
  const { container } = render(<ModeChip />);
  expect(container.querySelector('[data-slot="mode-chip"]')?.textContent).toBe("Focus");
});

test("children_replace_the_default_word", () => {
  const { container } = render(<ModeChip mode="warning">At limit</ModeChip>);
  expect(container.querySelector('[data-slot="mode-chip"]')?.textContent).toBe("At limit");
});

test("exposes_label_not_control", () => {
  const { container } = render(<ModeChip mode="break" />);
  const chip = container.querySelector('[data-slot="mode-chip"]') as HTMLElement;
  expect(chip.tagName).toBe("SPAN");
  expect(chip.getAttribute("role")).toBeNull();
  expect(chip.getAttribute("tabindex")).toBeNull();
});
