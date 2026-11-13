import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { timerLayout } from "../../lib/timer-layout";
import { FullScreenFocus } from "./full-screen-focus";

vi.mock("../../lib/timer-layout", async (original) => {
  const real = await original<typeof import("../../lib/timer-layout")>();
  return {
    timerLayout: Object.assign(vi.fn(real.timerLayout), { tokens: real.timerLayout.tokens }),
  };
});

// jsdom has no ResizeObserver: a stub the test can fire with a box.
let fire: (width: number, height: number) => void = () => {};
globalThis.ResizeObserver = class {
  constructor(cb: ResizeObserverCallback) {
    fire = (width, height) =>
      cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as never);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
};
afterEach(() => vi.mocked(timerLayout).mockClear());

const base = {
  remaining: "18:42",
  remainingLabel: "18 minutes 42 seconds",
  progress: 0.25,
  mode: "focus" as const,
  clock: "09:41",
};

test("full_screen_focus_exposes_region_with_name", () => {
  render(<FullScreenFocus {...base} onLeave={() => {}} />);
  const region = screen.getByRole("region", { name: "Full-screen focus" });
  expect(region.getAttribute("data-slot")).toBe("full-screen-focus");
});

test("full_screen_focus_renders_running_ring_with_word", () => {
  render(<FullScreenFocus {...base} onLeave={() => {}} />);
  const timer = screen.getByRole("timer");
  expect(timer).toHaveAccessibleName(/Focus, 18 minutes 42 seconds remaining/);
  expect(within(timer).getByText("18:42")).toBeTruthy();
});

test("full_screen_focus_renders_paused_with_word", () => {
  render(<FullScreenFocus {...base} mode="paused" onLeave={() => {}} />);
  expect(screen.getByRole("timer")).toHaveAccessibleName(/^Paused,/);
});

test("full_screen_focus_takes_focus_on_mount", () => {
  render(<FullScreenFocus {...base} onLeave={() => {}} />);
  expect(document.activeElement).toBe(screen.getByLabelText("Full-screen focus"));
});

const none = () => {};

test("no_leave_dialog", () => {
  const onLeave = vi.fn();
  render(<FullScreenFocus {...base} onLeave={onLeave} />);
  fireEvent.click(screen.getByRole("button", { name: "Leave full screen" }));
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("full_screen_focus_escape_leaves_at_once", () => {
  const onLeave = vi.fn();
  render(<FullScreenFocus {...base} onLeave={onLeave} />);
  fireEvent.keyDown(screen.getByLabelText("Full-screen focus"), { key: "Escape" });
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("full_screen_focus_esc_inside_a_popover_menu_does_not_leave", () => {
  const onLeave = vi.fn();
  render(
    <FullScreenFocus
      {...base}
      mode="idle"
      onLeave={onLeave}
      summary={<div data-slot="popover-menu">menu</div>}
    />,
  );
  fireEvent.keyDown(screen.getByText("menu"), { key: "Escape" });
  expect(onLeave).not.toHaveBeenCalled();
});

test("full_screen_focus_marks_the_section_for_the_tooltip_esc_rule", () => {
  render(<FullScreenFocus {...base} onLeave={none} />);
  expect(screen.getByLabelText("Full-screen focus").hasAttribute("data-os-esc")).toBe(true);
});

test("full_screen_focus_controls_per_mode", () => {
  const onPause = vi.fn();
  const onResume = vi.fn();
  const onEnd = vi.fn();
  const view = render(
    <FullScreenFocus
      {...base}
      onLeave={none}
      onPause={onPause}
      onResume={onResume}
      onEnd={onEnd}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  expect(onPause).toHaveBeenCalledTimes(1);
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Resume session" })).toBeNull();
  view.rerender(
    <FullScreenFocus
      {...base}
      mode="paused"
      onLeave={none}
      onPause={onPause}
      onResume={onResume}
      onEnd={onEnd}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Resume session" }));
  expect(onResume).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Pause session" })).toBeNull();
});

test("full_screen_focus_idle_shows_start", () => {
  const onStart = vi.fn();
  render(<FullScreenFocus {...base} mode="idle" onLeave={none} onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Pause session" })).toBeNull();
  expect(screen.queryByRole("button", { name: "End session" })).toBeNull();
});

test("full_screen_focus_caption_follows_single_keys", () => {
  // What is seen: the Kbd glyphs and words, without the visually hidden spoken names.
  const caption = () => {
    const el = screen
      .getByLabelText("Full-screen focus")
      .querySelector("[data-slot=full-screen-focus-caption]")
      ?.cloneNode(true) as HTMLElement;
    for (const hidden of el.querySelectorAll(".sr-only")) hidden.remove();
    return el;
  };
  const view = render(<FullScreenFocus {...base} onLeave={none} singleKeys />);
  screen.getByLabelText("Full-screen focus").querySelector("[data-slot=full-screen-focus-caption]");
  expect(caption()).toHaveTextContent("Space pauses · Esc leaves");
  view.rerender(<FullScreenFocus {...base} onLeave={none} />);
  expect(caption()).toHaveTextContent("⌘. ends · Esc leaves");
  view.rerender(<FullScreenFocus {...base} mode="paused" onLeave={none} singleKeys />);
  expect(caption()).toHaveTextContent("Space resumes · Esc leaves");
  view.rerender(<FullScreenFocus {...base} mode="idle" onLeave={none} singleKeys />);
  expect(caption()).toHaveTextContent("Space starts · Esc leaves");
  view.rerender(<FullScreenFocus {...base} mode="idle" onLeave={none} />);
  expect(caption()).toHaveTextContent("⌘↩ starts · Esc leaves");
});

test("full_screen_focus_start_keyshortcuts_follow_single_keys", () => {
  const view = render(<FullScreenFocus {...base} mode="idle" onLeave={none} singleKeys />);
  const start = () => screen.getByRole("button", { name: "Start focus" });
  expect(start().getAttribute("aria-keyshortcuts")).toBe("Space Meta+Enter");
  view.rerender(<FullScreenFocus {...base} mode="idle" onLeave={none} />);
  expect(start().getAttribute("aria-keyshortcuts")).toBe("Meta+Enter");
});

test("full_screen_focus_ended_says_session_ended", () => {
  const view = render(<FullScreenFocus {...base} onLeave={none} />);
  const status = () => screen.getByRole("status");
  expect(status()).toHaveTextContent("");
  view.rerender(<FullScreenFocus {...base} ended onLeave={none} />);
  expect(status()).toHaveTextContent("Session ended.");
  expect(screen.getByRole("button", { name: "Start focus" })).toBeTruthy();
  expect(screen.getByRole("timer")).toHaveAccessibleName(/^No session/);
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

test("full_screen_focus_renders_host_summary", () => {
  const view = render(
    <FullScreenFocus {...base} mode="idle" onLeave={none} summary={<p>Classic · ends 15:20</p>} />,
  );
  expect(screen.getByText("Classic · ends 15:20")).toBeTruthy();
  view.rerender(<FullScreenFocus {...base} onLeave={none} summary={<p>Classic · ends 15:20</p>} />);
  expect(screen.queryByText("Classic · ends 15:20")).toBeNull();
  view.rerender(
    <FullScreenFocus {...base} ended onLeave={none} summary={<p>Classic · ends 15:20</p>} />,
  );
  expect(screen.getByText("Classic · ends 15:20")).toBeTruthy();
});

test("full_screen_focus_calls_timer_layout_on_resize_only", () => {
  const view = render(<FullScreenFocus {...base} onLeave={none} />);
  expect(timerLayout).not.toHaveBeenCalled();
  act(() => fire(1280, 720));
  expect(timerLayout).toHaveBeenCalledTimes(1);
  expect(timerLayout).toHaveBeenLastCalledWith({
    contentWidth: 1216,
    contentHeight: 656,
    windowWidth: 1280,
  });
  view.rerender(<FullScreenFocus {...base} remaining="18:41" onLeave={none} />);
  view.rerender(<FullScreenFocus {...base} remaining="18:40" onLeave={none} />);
  expect(timerLayout).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Full-screen focus").getAttribute("data-layout")).toBe("ring");
  act(() => fire(1000, 440));
  expect(timerLayout).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText("Full-screen focus").getAttribute("data-layout")).toBe("strip");
});

test("full_screen_focus_minimum_window_is_stacked", () => {
  render(<FullScreenFocus {...base} onLeave={none} />);
  act(() => fire(360, 240));
  const section = screen.getByLabelText("Full-screen focus");
  expect(section.getAttribute("data-layout")).toBe("stackedStrip");
  expect(screen.getByRole("timer")).toHaveAccessibleName("Focus, 18 minutes 42 seconds remaining");
});

test("status_line_shows_the_hosts_text_in_the_same_live_region", () => {
  const { rerender } = render(
    <FullScreenFocus {...base} onLeave={none} mode="focus" status="Nothing saved." />,
  );
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Nothing saved.");
  rerender(<FullScreenFocus {...base} onLeave={none} mode="focus" />);
  expect(screen.getByRole("status")).toHaveTextContent("");
});
