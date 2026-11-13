import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FullScreenFocus } from "./full-screen-focus";

const base = {
  remaining: "18:42",
  remainingLabel: "18 minutes 42 seconds",
  progress: 0.25,
  mode: "focus" as const,
  onExit: () => {},
};

test("full_screen_focus_secondary_action_slot", () => {
  const onSelect = vi.fn();
  render(
    <FullScreenFocus
      {...base}
      secondaryActions={[
        { id: "more", label: "+10 min", name: "Add 10 minutes of focus", onSelect },
      ]}
    />,
  );
  const controls = document.querySelector("[data-slot=full-screen-focus-controls]") as HTMLElement;
  const add = within(controls).getByRole("button", { name: "Add 10 minutes of focus" });
  expect(add).toHaveTextContent("+10 min");
  fireEvent.click(add);
  expect(onSelect).toHaveBeenCalledTimes(1);
  // Pause stays the only round primary; the action is a quiet Button, last in Tab order.
  const buttons = within(controls).getAllByRole("button");
  expect(buttons.map((b) => b.getAttribute("data-slot"))).toEqual([
    "icon-button",
    "icon-button",
    "button",
  ]);
  expect(controls.querySelectorAll("[data-size=round]")).toHaveLength(1);
  expect(add.getAttribute("data-variant")).toBe("quiet");
});

test("full_screen_focus_two_actions_for_offer", () => {
  const keep = vi.fn();
  const stop = vi.fn();
  render(
    <FullScreenFocus
      {...base}
      mode="idle"
      offer
      secondaryActions={[
        { id: "keep", label: "Keep going", name: "Keep going with Steady Focus", onSelect: keep },
        { id: "stop", label: "Stop here", onSelect: stop },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Keep going with Steady Focus" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop here" }));
  expect(keep).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Stop here" }).getAttribute("data-variant")).toBe(
    "ghost",
  );
});

test("full_screen_focus_offer_first_action_is_the_primary", () => {
  const actions = [
    { id: "keep", label: "Keep going", onSelect: () => {} },
    { id: "stop", label: "Stop here", onSelect: () => {} },
  ];
  const view = render(<FullScreenFocus {...base} mode="idle" offer secondaryActions={actions} />);
  expect(screen.getByRole("button", { name: "Keep going" }).getAttribute("data-variant")).toBe(
    "primary",
  );
  expect(screen.queryByRole("button", { name: "Start focus" })).toBeNull();
  // Without `offer`, idle keeps Start and the actions stay quiet then ghost.
  view.rerender(<FullScreenFocus {...base} mode="idle" secondaryActions={actions} />);
  expect(screen.getByRole("button", { name: "Start focus" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Keep going" }).getAttribute("data-variant")).toBe(
    "quiet",
  );
});

test("full_screen_focus_no_actions_by_default", () => {
  render(<FullScreenFocus {...base} />);
  expect(screen.getByRole("button", { name: "End session" })).toBeTruthy();
  expect(
    document.querySelectorAll("[data-slot=full-screen-focus-controls] [data-slot=button]"),
  ).toHaveLength(0);
});

test("full_screen_focus_end_break_label", () => {
  const view = render(<FullScreenFocus {...base} mode="break" />);
  expect(screen.getByRole("button", { name: "End break" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Pause break" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "End session" })).toBeNull();
  // A break's last 2:00 and a paused break are told by `phase`, not by `mode`.
  view.rerender(<FullScreenFocus {...base} mode="warning" phase="break" />);
  expect(screen.getByRole("button", { name: "End break" })).toBeTruthy();
  view.rerender(<FullScreenFocus {...base} mode="paused" phase="break" />);
  expect(screen.getByRole("button", { name: "End break" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Resume break" })).toBeTruthy();
  view.rerender(<FullScreenFocus {...base} mode="warning" />);
  expect(screen.getByRole("button", { name: "End session" })).toBeTruthy();
});

test("full_screen_focus_two_actions_in_break", () => {
  render(
    <FullScreenFocus
      {...base}
      mode="break"
      secondaryActions={[
        {
          id: "extend",
          label: "+10 min",
          name: "Back to focus for 10 more minutes",
          onSelect: () => {},
        },
        { id: "skip", label: "Skip break", onSelect: () => {} },
      ]}
    />,
  );
  const controls = document.querySelector("[data-slot=full-screen-focus-controls]") as HTMLElement;
  const buttons = within(controls).getAllByRole("button");
  expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
    "Pause break",
    "End break",
    "Back to focus for 10 more minutes",
    "Skip break",
  ]);
  expect(buttons[2]?.getAttribute("data-variant")).toBe("quiet");
  expect(buttons[3]?.getAttribute("data-variant")).toBe("ghost");
  expect(controls.className).toContain("gap-2");
  expect(controls.querySelectorAll("[data-size=round]")).toHaveLength(1);
});
