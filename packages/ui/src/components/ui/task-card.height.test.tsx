import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskCard } from "./task-card";

let listeners: Array<() => void> = [];
let tight = false;

beforeEach(() => {
  tight = false;
  listeners = [];
  document.documentElement.style.setProperty("--layout-tight-height", "700px");
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return tight && query === "(height < 700px)";
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: () => void) => {
        listeners = listeners.filter((l) => l !== fn);
      },
    })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--layout-tight-height");
});

const full = (
  <TaskCard
    title="Write the intro"
    estimate={3}
    done={1}
    due="Due Friday"
    tags={["writing", "client"]}
    onOpen={() => {}}
  />
);

test("tall_window_keeps_dots_due_and_tags_apart", () => {
  const { container } = render(full);
  expect(container.querySelector("[data-slot=task-card-dots]")).toBeTruthy();
  expect(container.querySelector("[data-slot=task-card-due]")).toBeTruthy();
  expect(container.querySelector("[data-slot=task-card-tags]")).toBeTruthy();
  expect(container.querySelector("[data-slot=task-card-fold]")).toBeNull();
});

test("short_window_folds_dots_due_and_tags_into_one_truncating_line", () => {
  tight = true;
  const { container } = render(full);
  const fold = container.querySelector("[data-slot=task-card-fold]") as HTMLElement;
  expect(fold).toBeTruthy();
  expect(fold.textContent).toContain("Due Friday");
  expect(fold.textContent).toContain("writing");
  expect(fold.querySelector("[data-slot=task-card-dots]")).toBeTruthy();
  expect(fold.querySelector(".truncate")).toBeTruthy();
  expect(container.querySelector("[data-slot=task-card-tags]")).toBeNull();
  expect(container.querySelector("[data-slot=task-card-due]")).toBeNull();
});

test("short_window_name_still_carries_everything", () => {
  tight = true;
  render(full);
  const name = screen.getByRole("button").getAttribute("aria-label") ?? "";
  expect(name).toContain("Due Friday");
  expect(name).toContain("writing, client");
});

test("resizing_taller_unfolds", () => {
  tight = true;
  const { container } = render(full);
  expect(container.querySelector("[data-slot=task-card-fold]")).toBeTruthy();
  tight = false;
  act(() => {
    for (const l of listeners) l();
  });
  expect(container.querySelector("[data-slot=task-card-fold]")).toBeNull();
});

test("moving_card_height_steady", () => {
  // Selected and Moving are words on the chip line, so no state adds a line.
  const { container } = render(<TaskCard title="Write" selected moving onOpen={() => {}} />);
  expect(container.querySelector("[data-slot=task-card-state]")).toBeNull();
  expect(container.querySelector("[data-slot=task-card-selected]")).toBeNull();
  const word = container.querySelector("[data-slot=task-card-moving]") as HTMLElement;
  expect(word.parentElement?.getAttribute("data-slot")).toBe("task-card-top");
  expect(container.querySelector("[data-slot=task-card-top]")?.className).toContain("flex-nowrap");
  expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Moving");
});

test("selected_word_sits_on_the_chip_line", () => {
  const { container } = render(<TaskCard title="Write" selected onOpen={() => {}} />);
  const word = container.querySelector("[data-slot=task-card-selected]") as HTMLElement;
  expect(word.textContent).toBe("Selected");
  expect(word.parentElement?.getAttribute("data-slot")).toBe("task-card-top");
  expect(container.querySelector("[data-slot=task-card-state]")).toBeNull();
});

test("short_window_with_due_only_renders_no_empty_plan_line", () => {
  tight = true;
  const { container } = render(full);
  expect(container.querySelector("[data-slot=task-card-plan]")).toBeNull();
});

test("short_window_many_dots_stay_inside_the_fold", () => {
  tight = true;
  const { container } = render(<TaskCard title="Big" estimate={12} due="Due Friday" />);
  const dots = container.querySelector("[data-slot=task-card-dots]") as HTMLElement;
  expect(dots.className).toContain("overflow-hidden");
  expect(dots.className).toContain("min-w-0");
});
