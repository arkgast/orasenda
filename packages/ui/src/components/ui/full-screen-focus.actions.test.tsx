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

test("full_screen_focus_no_actions_by_default_and_end_break_label", () => {
  const view = render(<FullScreenFocus {...base} />);
  expect(screen.getByRole("button", { name: "End session" })).toBeTruthy();
  expect(
    document.querySelectorAll("[data-slot=full-screen-focus-controls] [data-slot=button]"),
  ).toHaveLength(0);
  view.rerender(<FullScreenFocus {...base} mode="break" />);
  expect(screen.getByRole("button", { name: "End break" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "End session" })).toBeNull();
});
