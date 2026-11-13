import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TimerRing } from "./timer-ring";

const RUN = { remaining: "18:42", remainingLabel: "18 minutes 42 seconds", progress: 0.25 };

// Changed from the Version 28 markup snapshots (os-* classes): the same facts, asserted through
// the role, the accessible name, the geometry attributes and data-slot.
test("timer_ring_numeric_size_unchanged", () => {
  const { container } = render(<TimerRing size={280} mode="focus" {...RUN} />);
  const ring = screen.getByRole("timer", { name: "Focus, 18 minutes 42 seconds remaining" });
  expect(ring.getAttribute("aria-live")).toBe("off");
  expect(ring.style.width).toBe("280px");
  expect(container.querySelector("[data-slot=timer-ring-box]")).toBeNull();
  const svg = container.querySelector("svg");
  expect(svg?.getAttribute("viewBox")).toBe("0 0 280 280");
  expect(svg?.getAttribute("aria-hidden")).toBe("true");
  const track = container.querySelector("[data-slot=timer-ring-track]");
  expect(track?.getAttribute("r")).toBe("136.5");
  expect(track?.getAttribute("stroke-width")).toBe("2.3333333333333335");
  const arc = container.querySelector("[data-slot=timer-ring-arc]");
  expect(arc?.getAttribute("stroke-width")).toBe("7");
  expect(arc?.getAttribute("stroke-dasharray")).toBe("857.6547944300136");
  expect(arc?.getAttribute("stroke-dashoffset")).toBe("214.4136986075034");
  expect(screen.getByText("18:42")).toBeTruthy();
});

test("timer_ring_numeric_idle_has_no_arc_or_digits", () => {
  const { container } = render(<TimerRing size={280} mode="idle" />);
  expect(screen.getByRole("timer", { name: "No session" })).toBeTruthy();
  expect(container.querySelector("[data-slot=timer-ring-arc]")).toBeNull();
  expect(container.querySelector("[data-slot=timer-ring-digits]")).toBeNull();
  expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 280 280");
});

test("timer_ring_fluid_uses_container_sizing", () => {
  const { container } = render(<TimerRing size="fluid" mode="focus" {...RUN} />);
  const ring = screen.getByRole("timer", { name: "Focus, 18 minutes 42 seconds remaining" });
  expect(ring.parentElement?.getAttribute("data-slot")).toBe("timer-ring-box");
  expect(ring.style.width).toContain("clamp(var(--timer-min-size)");
  expect(ring.style.width).toContain("var(--timer-full-size)");
  expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 400 400");
});

test("timer_ring_has_no_task_slot", () => {
  const { container } = render(<TimerRing mode="focus" {...RUN} />);
  expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
    "Focus, 18 minutes 42 seconds remaining",
  );
  expect(container.querySelector("[data-slot=timer-ring-task]")).toBeNull();
});

test("timer_ring_clock_in_name_and_shown_small", () => {
  const { container } = render(<TimerRing mode="focus" {...RUN} clock="09:41" />);
  expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
    "Focus, 18 minutes 42 seconds remaining, Wall clock, 09:41",
  );
  expect(container.querySelector("[data-slot=timer-ring-clock]")?.textContent).toBe(
    "Clock · 09:41",
  );
});

test.each([
  ["focus", "Focus"],
  ["break", "Break"],
  ["warning", "Almost up"],
  ["paused", "Paused"],
  ["idle", "No session"],
  ["routine", "Routine"],
] as const)("renders_%s_with_word_or_shape", (mode, word) => {
  const { container } = render(<TimerRing mode={mode} remaining="10:00" />);
  const chip = container.querySelector("[data-slot=mode-chip]") as HTMLElement;
  expect(chip.textContent).toBe(word);
  expect(chip.querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("timer").getAttribute("data-mode")).toBe(mode);
});

test("warning_arc_fades_on_duration_slow", () => {
  const { container } = render(<TimerRing mode="warning" remaining="01:48" progress={0.9} />);
  const arc = container.querySelector("[data-slot=timer-ring-arc]") as SVGElement;
  expect(arc.style.transition).toContain("var(--duration-slow)");
  expect(arc.getAttribute("class")).toContain("stroke-amber");
  const focus = render(<TimerRing mode="focus" remaining="10:00" progress={0.1} />);
  const other = focus.container.querySelector("[data-slot=timer-ring-arc]") as SVGElement;
  expect(other.style.transition).not.toContain("var(--duration-slow)");
});

test("exposes_timer_with_name", () => {
  render(<TimerRing mode="paused" remaining="12:16" remainingLabel="12 minutes 16 seconds" />);
  expect(
    screen.getByRole("timer", { name: "Paused, 12 minutes 16 seconds remaining" }),
  ).toBeTruthy();
});

test("digits_length_attr_long_for_h_mm_ss", () => {
  const long = render(<TimerRing mode="focus" remaining="1:29:59" />);
  expect(
    long.container.querySelector("[data-slot=timer-ring-digits]")?.getAttribute("data-length"),
  ).toBe("long");
  const short = render(<TimerRing mode="focus" remaining="25:00" />);
  expect(
    short.container.querySelector("[data-slot=timer-ring-digits]")?.getAttribute("data-length"),
  ).toBe("short");
  const five = render(<TimerRing mode="focus" remaining="9:59" />);
  expect(
    five.container.querySelector("[data-slot=timer-ring-digits]")?.getAttribute("data-length"),
  ).toBe("short");
});
