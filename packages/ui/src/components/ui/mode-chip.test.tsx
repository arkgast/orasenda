import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { ModeChip } from "./mode-chip";

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
