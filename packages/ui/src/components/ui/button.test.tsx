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
  for (const variant of ["primary", "break", "quiet", "ghost", "critical"] as const) {
    rerender(<Button variant={variant}>Label</Button>);
    expect(screen.getByRole("button", { name: "Label" }).getAttribute("data-variant")).toBe(variant);
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
