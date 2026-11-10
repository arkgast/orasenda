import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TimerRing } from "./index.ts";

// Captured from the Version 28 bundle (9106f88) with Today's props before the refresh.
const V28_IDLE =
  '<div class="os-timer os-timer-idle" style="width:280px" role="timer" aria-live="off" aria-label="No session"><svg class="os-timer-ring" viewBox="0 0 280 280" aria-hidden="true"><circle class="track" cx="140" cy="140" r="136.5" stroke-width="2.3333333333333335"></circle></svg><div class="os-timer-center" aria-hidden="true"><span class="os-chip os-mode-idle"><svg class="os-shape" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"></circle></svg>No session</span></div></div>';
const V28_FOCUS =
  '<div class="os-timer os-timer-focus" style="width:280px" role="timer" aria-live="off" aria-label="Focus, 18 minutes 42 seconds remaining"><svg class="os-timer-ring" viewBox="0 0 280 280" aria-hidden="true"><circle class="track" cx="140" cy="140" r="136.5" stroke-width="2.3333333333333335"></circle><circle class="prog" cx="140" cy="140" r="136.5" stroke-width="7" stroke-dasharray="857.6547944300136" stroke-dashoffset="214.4136986075034"></circle></svg><div class="os-timer-center" aria-hidden="true"><span class="os-chip os-mode-focus"><svg class="os-shape" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="5"></circle></svg>Focus</span><div class="os-timer-digits">18:42</div></div></div>';
const TASK =
  "Finish the chapter 3 outline and send the draft to Maya before the review meeting on Thursday afternoon";

test("timer_ring_fluid_uses_container_sizing", () => {
  const { container } = render(
    <TimerRing
      size="fluid"
      mode="focus"
      remaining="18:42"
      remainingLabel="18 minutes 42 seconds"
      progress={0.25}
    />,
  );
  const ring = container.querySelector(".os-timer") as HTMLElement;
  expect(ring.parentElement?.classList.contains("os-timer-box")).toBe(true);
  expect(ring.style.width).toBe("");
  expect(screen.getByRole("timer", { name: "Focus, 18 minutes 42 seconds remaining" })).toBe(ring);
});

test("timer_ring_numeric_size_unchanged", () => {
  expect(renderToStaticMarkup(<TimerRing size={280} mode="idle" />)).toBe(V28_IDLE);
  expect(
    renderToStaticMarkup(
      <TimerRing
        size={280}
        mode="focus"
        remaining="18:42"
        remainingLabel="18 minutes 42 seconds"
        progress={0.25}
      />,
    ),
  ).toBe(V28_FOCUS);
  const { container } = render(<TimerRing size={280} mode="idle" />);
  expect(container.querySelector(".os-timer-box")).toBeNull();
  expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 280 280");
  expect(screen.getByRole("timer", { name: "No session" })).toBeTruthy();
});

test("timer_ring_task_whole_in_accessible_name", () => {
  const { container } = render(
    <TimerRing
      mode="focus"
      remaining="18:42"
      remainingLabel="18 minutes 42 seconds"
      progress={0.25}
      task={TASK}
    />,
  );
  const name = screen.getByRole("timer").getAttribute("aria-label") ?? "";
  expect(name.endsWith(TASK)).toBe(true);
  expect(container.querySelector(".os-timer-task")?.textContent).toBe(TASK);
});

test.each([
  ["focus", "Focus"],
  ["break", "Break"],
  ["warning", "Almost up"],
  ["paused", "Paused"],
  ["idle", "No session"],
  ["routine", "Routine"],
] as const)("timer_ring_every_mode_has_word_or_shape (%s)", (mode, word) => {
  const { container } = render(<TimerRing mode={mode} remaining="10:00" />);
  const chip = container.querySelector(".os-chip") as HTMLElement;
  expect(chip.textContent).toBe(word);
  expect(chip.querySelector("svg.os-shape")).not.toBeNull();
});
