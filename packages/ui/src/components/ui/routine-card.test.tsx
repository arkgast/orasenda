import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { RoutineCard } from "./routine-card";

test("is_an_article_named_by_its_heading", () => {
  render(<RoutineCard name="Morning Light" meta="07:00 · Every day" today="notStarted" />);
  const card = screen.getByRole("article", { name: "Morning Light" });
  const heading = within(card).getByRole("heading", { level: 2, name: "Morning Light" });
  expect(card.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(heading.id).not.toBe("");
});

test("heading_level_can_be_three", () => {
  render(<RoutineCard name="Wind-down" today="notStarted" headingLevel={3} />);
  expect(screen.getByRole("heading", { level: 3, name: "Wind-down" })).toBeTruthy();
});

test("two_cards_have_distinct_heading_ids", () => {
  render(
    <>
      <RoutineCard name="One" today="notStarted" />
      <RoutineCard name="Two" today="notStarted" />
    </>,
  );
  const [a, b] = screen.getAllByRole("article");
  expect(a.getAttribute("aria-labelledby")).not.toBe(b.getAttribute("aria-labelledby"));
});

test("shows_meta", () => {
  render(<RoutineCard name="Deep Work Start" meta="09:00 · Weekdays" today="notStarted" />);
  expect(screen.getByText("09:00 · Weekdays")).toBeTruthy();
});

test.each([
  ["notStarted", "ring", "Not started today"],
  ["inProgress", "half", "2 of 5 done today"],
  ["finished", "check", "Done today, 4 of 5"],
] as const)("today_%s_is_a_shape_plus_words", (today, shape, line) => {
  const { container } = render(<RoutineCard name="R" today={today} todayLine={line} />);
  const row = container.querySelector("[data-slot='routine-card-today']");
  expect(row?.getAttribute("data-today")).toBe(today);
  expect(row?.textContent).toBe(line);
  const mark = row?.querySelector("[data-slot='routine-card-shape']");
  expect(mark?.getAttribute("data-shape")).toBe(shape);
  expect(mark?.getAttribute("aria-hidden")).toBe("true");
});

test.each([
  ["notStarted", "Not started today"],
  ["inProgress", "In progress today"],
  ["finished", "Done today"],
] as const)("today_%s_has_a_default_line", (today, words) => {
  render(<RoutineCard name="R" today={today} />);
  expect(screen.getByText(words)).toBeTruthy();
});

test.each(["toString", "constructor", "__proto__"])(
  "inherited_key_%s_reads_as_not_started",
  (key) => {
    const { container } = render(<RoutineCard name="R" today={key as never} />);
    const row = container.querySelector("[data-slot='routine-card-today']");
    expect(row?.getAttribute("data-today")).toBe("notStarted");
    const mark = row?.querySelector("[data-slot='routine-card-shape']");
    expect(mark?.getAttribute("data-shape")).toBe("ring");
  },
);

test("unknown_today_reads_as_not_started", () => {
  const { container } = render(<RoutineCard name="R" today={"nope" as never} />);
  const row = container.querySelector("[data-slot='routine-card-today']");
  expect(row?.getAttribute("data-today")).toBe("notStarted");
  expect(row?.textContent).toBe("Not started today");
});

test("renders_steps_actions_and_footer_slots", () => {
  render(
    <RoutineCard
      name="Study Session"
      today="notStarted"
      actions={<button type="button">Start</button>}
      footer={<span>Wellness suggestion, not medical advice.</span>}
    >
      <span>Test yourself</span>
    </RoutineCard>,
  );
  const card = screen.getByRole("article", { name: "Study Session" });
  expect(within(card).getByRole("button", { name: "Start" })).toBeTruthy();
  expect(within(card).getByText("Test yourself")).toBeTruthy();
  expect(within(card).getByText("Wellness suggestion, not medical advice.")).toBeTruthy();
});

test("empty_slots_render_nothing", () => {
  const { container } = render(<RoutineCard name="R" today="notStarted" />);
  for (const slot of ["routine-card-steps", "routine-card-actions", "routine-card-footer"]) {
    expect(container.querySelector(`[data-slot='${slot}']`)).toBeNull();
  }
});

test("routine_accent_sits_on_the_edge_only", () => {
  const { container } = render(<RoutineCard name="R" today="notStarted" />);
  const card = container.querySelector("[data-slot='routine-card']");
  expect(card?.className).toContain("border-s-routine");
  expect(card?.className).not.toMatch(/\bbg-routine/);
  expect(container.innerHTML).not.toMatch(/\btext-routine/);
});

const edge = (today: string) => {
  const { container } = render(<RoutineCard name="R" today={today as "finished"} />);
  return container.querySelector("[data-slot='routine-card']")?.className ?? "";
};

test("finished_card_has_break_edge", () => {
  const cls = edge("finished");
  expect(cls).toContain("border-s-break");
  expect(cls).not.toContain("border-s-routine");
});

test.each(["inProgress", "notStarted", "bogus"])("%s_keeps_the_routine_edge", (today) => {
  const cls = edge(today);
  expect(cls).toContain("border-s-routine");
  expect(cls).not.toContain("border-s-break");
});

test("copy_has_no_loss_words", () => {
  const { container } = render(
    <>
      <RoutineCard name="A" today="notStarted" />
      <RoutineCard name="B" today="inProgress" />
      <RoutineCard name="C" today="finished" />
    </>,
  );
  expect(container.textContent).not.toMatch(/missed|broken|streak|failed|!/i);
});
