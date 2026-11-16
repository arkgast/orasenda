import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { expect, test, vi } from "vitest";
import { FlowStep } from "./flow-step";

const primary = <button type="button">Continue</button>;

test("flow_step_heading_focus_target", () => {
  const headingRef = createRef<HTMLHeadingElement>();
  render(
    <FlowStep
      title="Tomorrow"
      progress="Step 2 of 4"
      primary={primary}
      onEnd={() => {}}
      headingRef={headingRef}
    >
      Body
    </FlowStep>,
  );
  const h1 = screen.getByRole("heading", { level: 1, name: "Tomorrow" });
  expect(h1.getAttribute("tabindex")).toBe("-1");
  expect(headingRef.current).toBe(h1);
  expect(screen.getByText("Step 2 of 4")).toBeTruthy();
  expect(screen.getByRole("button", { name: "End" })).toBeTruthy();
});

test("esc_calls_on_end", () => {
  const onEnd = vi.fn();
  render(
    <FlowStep title="T" progress="Step 1 of 4" primary={primary} onEnd={onEnd}>
      <p>Body</p>
    </FlowStep>,
  );
  fireEvent.keyDown(screen.getByText("Body"), { key: "Escape" });
  expect(onEnd).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "End" }));
  expect(onEnd).toHaveBeenCalledTimes(2);
});

test("inner_esc_not_ending", () => {
  const onEnd = vi.fn();
  render(
    <FlowStep title="T" progress="Step 1 of 4" primary={primary} onEnd={onEnd}>
      <input
        aria-label="Inner"
        onKeyDown={(e) => {
          if (e.key === "Escape") e.stopPropagation();
        }}
      />
      <input
        aria-label="Prevented"
        onKeyDown={(e) => {
          if (e.key === "Escape") e.preventDefault();
        }}
      />
    </FlowStep>,
  );
  fireEvent.keyDown(screen.getByLabelText("Inner"), { key: "Escape" });
  fireEvent.keyDown(screen.getByLabelText("Prevented"), { key: "Escape" });
  expect(onEnd).not.toHaveBeenCalled();
});

test("not_now_shown_only_when_given", () => {
  const onClick = vi.fn();
  const { rerender } = render(
    <FlowStep title="T" progress="Step 3 of 4" primary={primary} onEnd={() => {}}>
      Body
    </FlowStep>,
  );
  expect(screen.queryByRole("button", { name: "Not now" })).toBeNull();
  rerender(
    <FlowStep
      title="T"
      progress="Step 3 of 4"
      primary={primary}
      notNow={{ label: "Not now", onClick }}
      onEnd={() => {}}
    >
      Body
    </FlowStep>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("reduce_motion_no_transition", () => {
  const { container } = render(
    <FlowStep title="T" progress="Step 1 of 4" primary={primary} onEnd={() => {}}>
      Body
    </FlowStep>,
  );
  const body = container.querySelector("[data-slot=flow-step-body]") as HTMLElement;
  expect(body.className).toContain("duration-calm");
  expect(body.className).toContain("ease-calm");
  expect(body.className).toContain("motion-reduce:transition-none");
});
