import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { expect, test, vi } from "vitest";
import { Button } from "./button";
import { RoutineStep, type RoutineStepProps } from "./routine-step";
import { RoutineStepSpecimen } from "./routine-step.specimen";

const STEPS: RoutineStepProps["steps"] = [
  { name: "Drink a glass of water", state: "done" },
  { name: "Get outdoor light", state: "upcoming" },
  { name: "Move for 5–10 minutes", state: "upcoming" },
];

function renderStep(props: Partial<RoutineStepProps> = {}) {
  return render(
    <RoutineStep
      routineName="Morning Light & Movement"
      progressLine="Step 2 of 3"
      step={{
        name: "Get outdoor light",
        detail: ["5–10 min, 15–20 if overcast.", "Two minutes: step outside the door."],
      }}
      steps={STEPS}
      actions={
        <>
          <Button variant="primary">Done</Button>
          <Button>Skip for today</Button>
        </>
      }
      {...props}
    />,
  );
}

test("routine_name_is_the_heading_and_names_the_region", () => {
  renderStep();
  const heading = screen.getByRole("heading", { level: 1, name: "Morning Light & Movement" });
  const region = screen.getByRole("region", { name: "Morning Light & Movement" });
  expect(region).toHaveAttribute("data-slot", "routine-step");
  expect(region).toContainElement(heading);
  expect(screen.getByText("Step 2 of 3")).toHaveAttribute("data-slot", "routine-step-progress");
});

test("step_name_is_the_focus_target_with_its_detail_lines", () => {
  const ref = createRef<HTMLHeadingElement>();
  renderStep({ stepNameRef: ref });
  const name = screen.getByRole("heading", { level: 2, name: "Get outdoor light" });
  expect(name).toHaveAttribute("tabindex", "-1");
  expect(name).toHaveAttribute("data-slot", "routine-step-name");
  expect(ref.current).toBe(name);
  name.focus();
  expect(name).toHaveFocus();
  const detail = screen.getAllByText(/./, { selector: "[data-slot=routine-step-detail] p" });
  expect(detail.map((d) => d.textContent)).toEqual([
    "5–10 min, 15–20 if overcast.",
    "Two minutes: step outside the door.",
  ]);
});

test("an_optional_step_says_so_in_words", () => {
  renderStep({ step: { name: "Electrolytes", optional: true } });
  const name = screen.getByRole("heading", { level: 2 });
  expect(name).toHaveTextContent("Electrolytes");
  expect(within(name).getByText("Optional")).toBeVisible();
  // The focused heading reads "Electrolytes, Optional", not "Electrolytes Optional".
  expect(name.textContent).toBe("Electrolytes, Optional");
});

test("identical_detail_lines_both_render_without_a_key_warning", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  renderStep({ step: { name: "Breathe", detail: ["In for four.", "In for four."] } });
  const detail = screen.getAllByText("In for four.");
  expect(detail).toHaveLength(2);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test("actions_slot_renders_the_hosts_buttons", () => {
  renderStep();
  const actions = document.querySelector("[data-slot=routine-step-actions]") as HTMLElement;
  expect(within(actions).getByRole("button", { name: "Done" })).toBeVisible();
  expect(within(actions).getByRole("button", { name: "Skip for today" })).toBeVisible();
});

test("progress_list_is_an_ordered_list_and_the_current_step_is_marked", () => {
  renderStep();
  const list = screen.getByRole("list", { name: "Steps" });
  expect(list.tagName).toBe("OL");
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(items[1]).toHaveAttribute("aria-current", "step");
  expect(items[0]).not.toHaveAttribute("aria-current");
  expect(items[2]).not.toHaveAttribute("aria-current");
});

test("each_step_shows_its_state_as_a_shape_and_a_word", () => {
  render(
    <RoutineStep
      routineName="Wind-down"
      progressLine="Step 3 of 4"
      step={{ name: "Read a page" }}
      steps={[
        { name: "Dim the lights", state: "done" },
        { name: "Set a no-screens cutoff", state: "skipped" },
        { name: "Read a page", state: "upcoming" },
        { name: "Lights out", state: "upcoming" },
      ]}
    />,
  );
  const items = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
  const words = items.map(
    (li) => li.querySelector("[data-slot=routine-step-state]")?.textContent ?? "",
  );
  expect(words).toEqual(["Done", "Skipped", "Now", "Upcoming"]);
  const shapes = items.map((li) => {
    const mark = li.querySelector("[data-slot=routine-step-mark]");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    return mark?.getAttribute("data-state");
  });
  expect(shapes).toEqual(["done", "skipped", "current", "upcoming"]);
  // The spoken text joins the name and the word.
  expect(items[1]).toHaveTextContent("Set a no-screens cutoff, Skipped");
});

test("current_defaults_to_the_first_upcoming_step_and_can_be_set", () => {
  const { rerender } = renderStep();
  let items = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
  expect(items[1]).toHaveAttribute("aria-current", "step");
  rerender(
    <RoutineStep
      routineName="Morning Light & Movement"
      progressLine="Step 3 of 3"
      step={{ name: "Move for 5–10 minutes" }}
      steps={STEPS}
      current={2}
    />,
  );
  items = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
  expect(items[2]).toHaveAttribute("aria-current", "step");
  expect(items[1]).not.toHaveAttribute("aria-current");
});

test("finished_shows_the_finished_line_and_no_current_step", () => {
  render(
    <RoutineStep
      routineName="Morning Light & Movement"
      step={{ name: "Move for 5–10 minutes" }}
      steps={[
        { name: "Drink a glass of water", state: "done" },
        { name: "Get outdoor light", state: "skipped" },
        { name: "Move for 5–10 minutes", state: "done" },
      ]}
      finished
      finishedLine="Routine finished. 2 of 3 done today."
      actions={<Button variant="primary">Back to routines</Button>}
    />,
  );
  expect(screen.getByText("Routine finished. 2 of 3 done today.")).toHaveAttribute(
    "data-slot",
    "routine-step-finished",
  );
  expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  const items = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
  for (const li of items) expect(li).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("button", { name: "Back to routines" })).toBeVisible();
});

test("the_step_change_cross_fades_only_without_reduce_motion", () => {
  const { rerender } = renderStep();
  const first = document.querySelector("[data-slot=routine-step-body]") as HTMLElement;
  expect(first.className).toContain("transition-opacity");
  expect(first.className).toContain("duration-calm");
  expect(first.className).toContain("ease-calm");
  expect(first.className).toContain("starting:opacity-0");
  expect(first.className).toContain("motion-reduce:transition-none");
  rerender(
    <RoutineStep
      routineName="Morning Light & Movement"
      progressLine="Step 3 of 3"
      step={{ name: "Move for 5–10 minutes" }}
      steps={STEPS}
      current={2}
    />,
  );
  // A new step mounts a new body, so the fade-in starts again from its starting style.
  const second = document.querySelector("[data-slot=routine-step-body]");
  expect(second).not.toBe(first);
});

test("copy_never_shames", () => {
  const { container } = renderStep();
  expect(container.textContent).not.toMatch(/missed|failed|broken|streak lost|!/i);
});

test("specimen_renders_in_light_and_dark", () => {
  for (const theme of ["light", "dark"]) {
    const { container, unmount } = render(
      <div data-theme={theme}>
        <RoutineStepSpecimen />
      </div>,
    );
    const frames = container.querySelectorAll("[data-frame]");
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll("[data-slot=routine-step]")).toHaveLength(frames.length);
    unmount();
  }
});
