import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TaskCard } from "./task-card";

test("moving_card_word_and_edge", () => {
  const { container } = render(<TaskCard title="Write" onOpen={() => {}} moving />);
  const card = container.querySelector("[data-slot=task-card]") as HTMLElement;
  expect(screen.getByText("Moving")).toBeTruthy();
  expect(card.classList.contains("border-dashed")).toBe(true);
  expect(card.className).toContain("border-line-strong");
  expect(card.className).not.toMatch(/opacity|shadow-raised/);
  expect(card.getAttribute("aria-label")).toContain("Moving");
});

test("moving_word_in_row_density_and_read_only", () => {
  const { container } = render(<TaskCard title="Write" density="row" moving />);
  expect(screen.getByText("Moving")).toBeTruthy();
  expect(
    container.querySelector("[data-slot=task-card]")?.classList.contains("border-dashed"),
  ).toBe(true);
});

test("not_moving_has_no_word_or_dashed_edge", () => {
  const { container } = render(<TaskCard title="Write" onOpen={() => {}} />);
  expect(screen.queryByText("Moving")).toBeNull();
  expect(
    container.querySelector("[data-slot=task-card]")?.classList.contains("border-dashed"),
  ).toBe(false);
});
