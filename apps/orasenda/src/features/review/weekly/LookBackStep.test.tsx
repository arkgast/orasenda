import { weeklyView } from "@shared/test/fixtures";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { LookBackStep } from "./LookBackStep";

afterEach(cleanup);

function withLookBack(patch: Record<string, unknown>) {
  const base = weeklyView();
  return { ...base, lookBack: { ...base.lookBack, ...patch } };
}

const MONDAY = {
  dayLabel: "Monday 16 November",
  lines: ["Went well: a calm day"],
};

test("focus_by_task_heading_only_with_tasks", () => {
  render(<LookBackStep view={weeklyView()} />);
  expect(screen.getByRole("heading", { level: 2, name: "Focus by task" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your shutdown notes" })).toBeNull();
});

test("focus_by_task_heading_sits_over_the_task_list", () => {
  render(<LookBackStep view={weeklyView()} />);
  const heading = screen.getByRole("heading", { level: 2, name: "Focus by task" });
  const list = screen.getByRole("list", { name: "Focus time by task" });
  expect(heading.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("shutdown_notes_heading_only_with_echoes", () => {
  render(<LookBackStep view={withLookBack({ tasks: [], reflections: [MONDAY] })} />);
  expect(screen.queryByRole("heading", { name: "Focus by task" })).toBeNull();
  const heading = screen.getByRole("heading", { level: 2, name: "Your shutdown notes" });
  const day = screen.getByText("Monday 16 November");
  expect(heading.compareDocumentPosition(day) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("neither_heading_when_both_are_empty", () => {
  render(<LookBackStep view={withLookBack({ tasks: [], reflections: [] })} />);
  expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
});
