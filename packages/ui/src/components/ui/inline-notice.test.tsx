import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { InlineNotice } from "./inline-notice";

const slot = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-slot="${name}"]`) as HTMLElement;

test("renders_neutral_with_word_or_shape", () => {
  const { container } = render(<InlineNotice>Saved once.</InlineNotice>);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Saved once.");
  expect(status.getAttribute("aria-atomic")).toBe("true");
  expect(status.querySelector("circle[fill='none']")).not.toBeNull();
  expect(slot(container, "inline-notice").getAttribute("data-tone")).toBe("neutral");
});

test("renders_warning_with_word_or_shape", () => {
  const { container } = render(<InlineNotice tone="warning">Two minutes left.</InlineNotice>);
  expect(screen.getByRole("status")).toHaveTextContent("Two minutes left.");
  expect(container.querySelector("path[d^='M5 0.5']")).not.toBeNull();
  expect(slot(container, "inline-notice").getAttribute("data-tone")).toBe("warning");
});

test("exposes_status_with_name", () => {
  render(<InlineNotice>Hello</InlineNotice>);
  expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Hello");
});

test("action_uses_actionname_and_calls_back", () => {
  const onAction = vi.fn();
  render(
    <InlineNotice actionLabel="Try again" actionName="Try again saving" onAction={onAction}>
      Failed
    </InlineNotice>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again saving" }));
  expect(onAction).toHaveBeenCalledTimes(1);
});

test("action_needs_label_and_handler", () => {
  render(<InlineNotice actionLabel="Go">x</InlineNotice>);
  expect(screen.queryByRole("button")).toBeNull();
});

test("row_neutral_has_no_shape", () => {
  const { container } = render(<InlineNotice variant="row">Saved.</InlineNotice>);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Saved.");
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.querySelector("svg")).toBeNull();
  expect(slot(container, "inline-notice").className).toContain("h-hit-min");
});

test("renders_row_attention_with_word_or_shape", () => {
  render(
    <InlineNotice variant="row" tone="attention">
      Focus didn't start.
    </InlineNotice>,
  );
  expect(screen.getByRole("status").querySelector("svg circle[r='5.75']")).not.toBeNull();
});

test("renders_row_warning_with_word_or_shape", () => {
  render(
    <InlineNotice variant="row" tone="warning">
      Two minutes left.
    </InlineNotice>,
  );
  expect(screen.getByRole("status").querySelector("path[d^='M5 0.5']")).not.toBeNull();
});

test("row_rest_is_muted_without_glyph", () => {
  render(
    <InlineNotice variant="row" tone="rest">
      Changes save as you make them.
    </InlineNotice>,
  );
  const status = screen.getByRole("status");
  expect(status.querySelector("svg")).toBeNull();
  expect(status.className).toContain("text-ink-muted");
});

test("row_empty_message_stays_mounted", () => {
  render(<InlineNotice variant="row">{""}</InlineNotice>);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

test("row_action_defaults_to_ghost_and_can_be_quiet", () => {
  const { rerender } = render(
    <InlineNotice variant="row" actionLabel="Got it" onAction={() => {}}>
      Tip
    </InlineNotice>,
  );
  expect(screen.getByRole("button", { name: "Got it" }).getAttribute("data-variant")).toBe("ghost");
  expect(screen.getByRole("button", { name: "Got it" })).toHaveClass("text-focus");
  rerender(
    <InlineNotice variant="row" actionVariant="quiet" actionLabel="Got it" onAction={() => {}}>
      Tip
    </InlineNotice>,
  );
  expect(screen.getByRole("button", { name: "Got it" }).getAttribute("data-variant")).toBe("quiet");
  expect(screen.getByRole("button", { name: "Got it" })).not.toHaveClass("text-focus");
});

test("inline_notice_row_keeps_one_always_mounted_status_paragraph", () => {
  const onAction = vi.fn();
  const { container, rerender } = render(<InlineNotice variant="row">{""}</InlineNotice>);
  const live = screen.getByRole("status");
  expect(live.tagName).toBe("P");
  expect(live).toHaveAttribute("aria-live", "polite");
  expect(live).toBeEmptyDOMElement();
  expect(container.querySelectorAll("[role=status]")).toHaveLength(1);

  rerender(<InlineNotice variant="row">Saved. Custom focus is now 50 minutes.</InlineNotice>);
  expect(screen.getByRole("status")).toBe(live);
  expect(live).toHaveTextContent("Saved. Custom focus is now 50 minutes.");
  expect((container.firstElementChild as HTMLElement).getAttribute("role")).toBeNull();

  rerender(
    <InlineNotice
      variant="row"
      tone="attention"
      actionLabel="Try again"
      actionName="Try again saving"
      onAction={onAction}
    >
      Theme wasn't saved. Back to Match system.
    </InlineNotice>,
  );
  expect(live.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again saving" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(live.contains(screen.getByRole("button"))).toBe(false);
});
