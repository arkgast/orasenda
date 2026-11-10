import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { describeShortcut, IconButton } from "./index.ts";

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.style.setProperty("--duration-quick", "160ms");
});
afterEach(() => {
  vi.useRealTimers();
});

const icon = (
  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d="M7.5 4.5v11M12.5 4.5v11" />
  </svg>
);

test("icon_button_name_is_label_and_icon_hidden", () => {
  const { container } = render(<IconButton label="Pause session" icon={icon} />);
  const button = screen.getByRole("button", { name: "Pause session" });
  expect(button.hasAttribute("title")).toBe(false);
  const wrap = container.querySelector(".os-iconbtn-icon");
  expect(wrap?.getAttribute("aria-hidden")).toBe("true");
});

test("icon_button_shortcut_sets_aria_keyshortcuts", () => {
  render(<IconButton label="End session" icon={icon} shortcut="⌘." />);
  const button = screen.getByRole("button", { name: "End session" });
  expect(button.getAttribute("aria-keyshortcuts")).toBe("Meta+Period");
  expect(button.getAttribute("aria-keyshortcuts")).toBe(describeShortcut("⌘.").aria);
});

test("icon_button_without_shortcut_has_no_keyshortcuts", () => {
  render(<IconButton label="Close" icon={icon} />);
  expect(screen.getByRole("button").hasAttribute("aria-keyshortcuts")).toBe(false);
});

test("icon_button_id_passes_through", () => {
  render(<IconButton label="Pages" icon={icon} id="pages-trigger" />);
  expect(screen.getByRole("button").id).toBe("pages-trigger");
});

test("icon_button_haspopup_passes_through", () => {
  render(<IconButton label="Pages" icon={icon} aria-haspopup="menu" />);
  expect(screen.getByRole("button").getAttribute("aria-haspopup")).toBe("menu");
});

test("icon_button_expanded_and_controls_pass_through", () => {
  const { rerender } = render(
    <IconButton
      label="Pages"
      icon={icon}
      aria-haspopup="menu"
      aria-expanded
      aria-controls="pages-menu"
    />,
  );
  const button = screen.getByRole("button");
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(button.getAttribute("aria-controls")).toBe("pages-menu");
  rerender(
    <IconButton
      label="Pages"
      icon={icon}
      aria-haspopup="menu"
      aria-expanded={false}
      aria-controls="pages-menu"
    />,
  );
  expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
});

test("icon_button_round_size_class", () => {
  const { rerender } = render(<IconButton label="Resume session" icon={icon} size="round" />);
  expect(screen.getByRole("button").classList.contains("os-iconbtn-round")).toBe(true);
  rerender(<IconButton label="Resume session" icon={icon} />);
  expect(screen.getByRole("button").classList.contains("os-iconbtn-round")).toBe(false);
});

test("icon_button_shortcut_array_joins_aria_and_label_overrides_kbd", () => {
  render(
    <IconButton
      label="Pages"
      icon={icon}
      shortcut={["⌘1", "⌘2", "⌘3", "⌘4", "⌘5", "⌘6"]}
      shortcutLabel="⌘1–6"
    />,
  );
  const button = screen.getByRole("button", { name: "Pages" });
  expect(button.getAttribute("aria-keyshortcuts")).toBe(
    "Meta+1 Meta+2 Meta+3 Meta+4 Meta+5 Meta+6",
  );
  fireEvent.pointerEnter(button);
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(document.querySelector(".os-tooltip-panel .os-kbd")?.textContent).toBe("⌘1–6");
});

test("icon_button_shortcut_array_without_label_shows_chords_joined", () => {
  render(<IconButton label="Pages" icon={icon} shortcut={["⌘1", "⌘2"]} />);
  const button = screen.getByRole("button", { name: "Pages" });
  fireEvent.pointerEnter(button);
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(document.querySelector(".os-tooltip-panel .os-kbd")?.textContent).toBe("⌘1 ⌘2");
});

test("icon_button_keyshortcuts_false_shows_kbd_without_aria", () => {
  render(<IconButton label="Pause session" icon={icon} shortcut="Space" keyshortcuts={false} />);
  const button = screen.getByRole("button", { name: "Pause session" });
  expect(button.hasAttribute("aria-keyshortcuts")).toBe(false);
  fireEvent.pointerEnter(button);
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(document.querySelector(".os-tooltip-panel .os-kbd")?.textContent).toBe("Space");
});

test("icon_button_describedby_passes_through", () => {
  render(
    <>
      <IconButton label="Jump to section" icon={icon} disabled aria-describedby="why" />
      <p id="why">Nothing to jump to yet.</p>
    </>,
  );
  const button = screen.getByRole("button", { name: "Jump to section" });
  expect(button.getAttribute("aria-describedby")).toBe("why");
  expect(button.hasAttribute("disabled")).toBe(true);
});
