import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Button } from "./button.tsx";

test("exposes_button_role_with_name", () => {
  render(<Button>Start focus</Button>);
  const button = screen.getByRole("button", { name: "Start focus" });
  expect(button.getAttribute("type")).toBe("button");
  expect(button.getAttribute("data-slot")).toBe("button");
});

test("renders_quiet_by_default_and_each_variant_by_data_attribute", () => {
  const { rerender } = render(<Button>Pause</Button>);
  expect(screen.getByRole("button").getAttribute("data-variant")).toBe("quiet");
  for (const variant of ["primary", "break", "quiet", "ghost", "inline", "critical"] as const) {
    rerender(<Button variant={variant}>Label</Button>);
    expect(screen.getByRole("button", { name: "Label" }).getAttribute("data-variant")).toBe(
      variant,
    );
  }
});

test("renders_lg_size_with_word_label", () => {
  render(
    <Button size="lg" variant="primary">
      Start focus
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Start focus" });
  expect(button.getAttribute("data-size")).toBe("lg");
  expect(button.textContent).toBe("Start focus");
});

test("renders_loading_disabled_busy_with_label_kept", () => {
  const onClick = vi.fn();
  render(
    <Button loading onClick={onClick}>
      Starting…
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Starting…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

test("renders_disabled_blocking_activation", () => {
  const onClick = vi.fn();
  render(
    <Button disabled onClick={onClick}>
      Save
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Save" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

test("renders_aria_disabled_focusable_and_blocking_activation", () => {
  const onClick = vi.fn();
  render(
    <Button aria-disabled="true" onClick={onClick}>
      Continue
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Continue" });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

test("activates_on_click_when_available", () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Resume</Button>);
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("passes_native_props_and_merges_class_name", () => {
  render(
    <Button type="submit" className="mt-2" aria-label="Save to Inbox" data-initial-focus>
      Save
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Save to Inbox" });
  expect(button.getAttribute("type")).toBe("submit");
  expect(button.classList.contains("mt-2")).toBe(true);
  expect(button.hasAttribute("data-initial-focus")).toBe(true);
});

test("md_keeps_body_size_and_ink_colour", () => {
  render(<Button>Pause</Button>);
  const cls = screen.getByRole("button").classList;
  expect(cls.contains("text-body")).toBe(true);
  expect(cls.contains("text-ink")).toBe(true);
});

test("lg_primary_keeps_heading_size_and_on_focus_colour", () => {
  render(
    <Button variant="primary" size="lg">
      Start focus
    </Button>,
  );
  const cls = screen.getByRole("button").classList;
  expect(cls.contains("text-heading")).toBe(true);
  expect(cls.contains("text-on-focus")).toBe(true);
  expect(cls.contains("text-body")).toBe(false);
});

test("treats_boolean_aria_disabled_as_unavailable", () => {
  const onClick = vi.fn();
  render(
    <Button aria-disabled={true} onClick={onClick}>
      Continue
    </Button>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(onClick).not.toHaveBeenCalled();
});

test("passes_aria_busy_through_when_not_loading", () => {
  render(<Button aria-busy="true">Wait</Button>);
  expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
});

test("has_dashed_disabled_look", () => {
  render(<Button disabled>Save</Button>);
  const cls = screen.getByRole("button").classList;
  expect(cls.contains("disabled:border-dashed")).toBe(true);
  expect(cls.contains("aria-disabled:border-dashed")).toBe(true);
});

test("every_variant_is_rounded_md", () => {
  for (const variant of ["primary", "break", "quiet", "ghost", "inline", "critical"] as const) {
    const { unmount } = render(<Button variant={variant}>Go</Button>);
    const { className } = screen.getByRole("button");
    expect(className).toContain("rounded-md");
    expect(className).not.toContain("rounded-pill");
    unmount();
  }
});

test("inline_variant_has_focus_text_and_ghost_ground", () => {
  render(<Button variant="inline">Open Board</Button>);
  const button = screen.getByRole("button", { name: "Open Board" });
  expect(button.getAttribute("data-variant")).toBe("inline");
  for (const name of [
    "border-clear",
    "bg-clear",
    "text-focus",
    "hover:bg-surface-sunken",
    "hover:text-ink",
    "active:bg-selection",
    "active:text-ink",
  ]) {
    expect(button.classList.contains(name)).toBe(true);
  }
});

test("row_size_is_flex_none_and_keeps_base_padding", () => {
  render(<Button size="row">Later</Button>);
  const button = screen.getByRole("button", { name: "Later" });
  expect(button.getAttribute("data-size")).toBe("row");
  expect(button.classList.contains("flex-none")).toBe(true);
  expect(button.classList.contains("px-fluid-stack")).toBe(true);
  expect(button.classList.contains("px-3")).toBe(false);
});

test("lg_keeps_px_fluid_stack", () => {
  render(<Button size="lg">Start</Button>);
  const cls = screen.getByRole("button", { name: "Start" }).classList;
  expect(cls.contains("px-fluid-stack")).toBe(true);
  expect(cls.contains("px-fluid-gutter")).toBe(false);
});

test("disabled_inline_has_the_shared_dashed_look", () => {
  render(<Button variant="inline">Open Board</Button>);
  const cls = screen.getByRole("button").classList;
  expect(cls.contains("disabled:border-dashed")).toBe(true);
  expect(cls.contains("disabled:text-ink-muted")).toBe(true);
});

// A button inside a card or section that sets overflow-wrap:anywhere (RoutineCard, .app-review-section)
// must still keep each word on one line and keep its width beside text ("Mor e" bug, owner 2026-11-18).
test("never_shrinks_or_splits_a_word_in_any_variant_or_size", () => {
  for (const variant of ["primary", "break", "quiet", "ghost", "inline", "critical"] as const) {
    for (const size of ["md", "lg", "row"] as const) {
      const { unmount } = render(
        <Button variant={variant} size={size}>
          More
        </Button>,
      );
      const classes = screen.getByRole("button").className.split(/\s+/);
      expect(classes).toContain("wrap-normal");
      expect(classes.includes("shrink-0") || classes.includes("flex-none")).toBe(true);
      unmount();
    }
  }
});
