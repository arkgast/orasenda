import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Kbd } from "./index.ts";

test("kbd_glyph_hidden_and_spoken_in_text", () => {
  const { container } = render(
    <p>
      Press <Kbd keys="⌃⌥F" spoken="Control-Option-F" /> to capture a thought.
    </p>,
  );
  const glyph = screen.getByText("⌃⌥F");
  expect(glyph.getAttribute("aria-hidden")).toBe("true");
  const spoken = container.querySelector(".os-sr-only");
  expect(spoken?.textContent).toBe("Control-Option-F");
  expect(spoken?.getAttribute("aria-hidden")).toBeNull();
});

test("kbd_in_tooltip_needs_no_spoken", () => {
  const { container } = render(<Kbd keys="⌘." inTooltip />);
  expect(screen.getByText("⌘.").getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector(".os-sr-only")).toBeNull();
});
