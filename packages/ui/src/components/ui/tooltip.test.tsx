import { act, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "radix-ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IconButton, Kbd } from "../../index";
import { Tooltip } from "./tooltip";

const panel = () => document.querySelector<HTMLElement>("[data-slot=tooltip]");
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const advanceFrames = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.style.setProperty("--duration-quick", "160ms");
  fireEvent.pointerDown(document.body);
});
afterEach(() => {
  vi.useRealTimers();
});

function Preset() {
  return (
    <Tooltip label="Change preset" shortcut="P">
      <button type="button">Classic · ends 15:20</button>
    </Tooltip>
  );
}

test("tooltip_shows_on_hover_after_duration_quick", () => {
  render(<Preset />);
  const trigger = screen.getByRole("button");
  fireEvent.pointerEnter(trigger);
  advance(159);
  expect(panel()).toBeNull();
  advance(1);
  expect(panel()?.textContent).toContain("Change preset");
});

test("tooltip_shows_on_focus_only_after_keyboard_event", () => {
  render(<Preset />);
  const trigger = screen.getByRole("button");
  act(() => trigger.focus());
  expect(panel()).toBeNull();
  act(() => trigger.blur());
  fireEvent.keyDown(document, { key: "Tab" });
  act(() => trigger.focus());
  expect(panel()?.textContent).toContain("Change preset");
});

test("tooltip_panel_and_kbd_are_aria_hidden", () => {
  render(<Preset />);
  fireEvent.pointerEnter(screen.getByRole("button"));
  advance(1000);
  expect(panel()?.getAttribute("aria-hidden")).toBe("true");
  expect(panel()?.querySelector("[data-slot=kbd]")).not.toBeNull();
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("tooltip_esc_hides", () => {
  render(<Preset />);
  const trigger = screen.getByRole("button");
  fireEvent.keyDown(document, { key: "Tab" });
  act(() => trigger.focus());
  expect(panel()).not.toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(panel()).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("tooltip_esc_in_a_data_os_esc_element_hides_and_still_reaches_the_host", () => {
  const host = vi.fn();
  render(
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: a stand-in host that records the key it receives
    <section data-os-esc="" onKeyDown={(e) => host(e.key)}>
      <Preset />
    </section>,
  );
  const trigger = screen.getByRole("button");
  fireEvent.keyDown(document, { key: "Tab" });
  act(() => trigger.focus());
  expect(panel()).not.toBeNull();
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(panel()).toBeNull();
  expect(host).toHaveBeenCalledWith("Escape");
});

test("tooltip_stays_while_hovered", () => {
  render(<Preset />);
  const trigger = screen.getByRole("button");
  fireEvent.pointerEnter(trigger);
  advance(160);
  const p = panel();
  expect(p).not.toBeNull();
  fireEvent.pointerLeave(trigger);
  advance(100);
  fireEvent.pointerEnter(p as Element);
  advance(500);
  expect(panel()).not.toBeNull();
  fireEvent.pointerLeave(p as Element);
  advance(159);
  expect(panel()).not.toBeNull();
  advance(1);
  expect(panel()).toBeNull();
});

test("tooltip_renders_inside_nearest_open_dialog", () => {
  const { unmount } = render(<Preset />);
  fireEvent.pointerEnter(screen.getByRole("button"));
  advance(160);
  // Radix wraps the panel in its own positioned element, so the body holds that wrapper.
  expect(panel()?.parentElement?.parentElement).toBe(document.body);
  unmount();

  render(
    <dialog open>
      <IconButton label="End session" icon={<span>x</span>} shortcut="⌘." />
    </dialog>,
  );
  fireEvent.pointerEnter(screen.getByRole("button", { name: "End session" }));
  advance(160);
  expect(panel()?.closest("dialog")).toBe(document.querySelector("dialog"));
});

test("tooltip_adds_no_live_region", () => {
  render(
    <>
      <Preset />
      <IconButton label="End session" icon={<span>x</span>} shortcut="⌘." />
      <p>
        <Kbd keys="P" spoken="P key" />
      </p>
    </>,
  );
  fireEvent.pointerEnter(screen.getByRole("button", { name: "End session" }));
  advance(160);
  expect(panel()).not.toBeNull();
  expect(document.querySelectorAll('[role="status"],[role="alert"],[aria-live]').length).toBe(0);
});

function Trap({ onClose }: { onClose?: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Content data-slot="dialog-content" data-testid="container" aria-describedby={undefined}>
          <Dialog.Title>Trap</Dialog.Title>
          <Tooltip label="Remove item">
            <button type="button">first</button>
          </Tooltip>
          <button type="button">second</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

test("tooltip_unmount_in_trap_keeps_focus", async () => {
  render(<Trap />);
  const first = screen.getByText("first");
  act(() => screen.getByText("second").focus());
  fireEvent.keyDown(document, { key: "Tab" });
  act(() => first.focus());
  expect(panel()).not.toBeNull();
  // The blur leaves focus on the body for a moment; the panel must not unmount in that window.
  act(() => first.blur());
  await act(async () => {
    await Promise.resolve();
  });
  expect(document.activeElement).not.toBe(screen.getByTestId("container"));
  act(() => screen.getByText("second").focus());
  await advanceFrames();
  expect(panel()).toBeNull();
  expect(document.activeElement).toBe(screen.getByText("second"));
});

test("esc_reaches_dialog_with_tooltip_open", async () => {
  const onClose = vi.fn();
  render(<Trap onClose={onClose} />);
  const first = screen.getByText("first");
  act(() => screen.getByText("second").focus());
  fireEvent.keyDown(document, { key: "Tab" });
  act(() => first.focus());
  expect(panel()).not.toBeNull();
  act(() => first.blur());
  expect(panel()).not.toBeNull();
  // Blur hide is pending: Esc reaches the trap's owner and the panel is gone at once.
  fireEvent.keyDown(first, { key: "Escape" });
  expect(onClose).toHaveBeenCalled();
  expect(panel()).toBeNull();
});
