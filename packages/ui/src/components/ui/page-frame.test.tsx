import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PageFrame } from "./page-frame";

const slot = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-slot=${name}]`);

test("exposes_heading_with_name", () => {
  render(<PageFrame title="Settings">Body</PageFrame>);
  const h1 = screen.getByRole("heading", { level: 1, name: "Settings" });
  expect(h1.getAttribute("tabindex")).toBe("-1");
  expect(h1.className).not.toContain("sr-only");
});

test("renders_list_header_status_and_region_in_order", () => {
  const { container } = render(
    <PageFrame title="Board" primary={<button type="button">Plan the day</button>} status="Saved">
      Body
    </PageFrame>,
  );
  const root = slot(container, "page-frame") as HTMLElement;
  expect(root.getAttribute("data-variant")).toBe("list");
  expect(Array.from(root.children).map((el) => el.getAttribute("data-slot"))).toEqual([
    "page-frame-header",
    "page-frame-status",
    "page-frame-body",
  ]);
  expect(screen.getByRole("button", { name: "Plan the day" })).toBeTruthy();
  expect(slot(container, "page-frame-status")?.textContent).toBe("Saved");
  expect(slot(container, "page-frame-body")?.textContent).toBe("Body");
});

test("renders_flow_with_footer_and_step_word", () => {
  const { container } = render(
    <PageFrame
      title="Weekly review"
      variant="flow"
      step="Step 2 of 4"
      footer={<button type="button">Continue</button>}
    >
      Body
    </PageFrame>,
  );
  const root = slot(container, "page-frame") as HTMLElement;
  expect(root.getAttribute("data-variant")).toBe("flow");
  expect(screen.getByText("Step 2 of 4")).toBeTruthy();
  const footer = slot(container, "page-frame-footer");
  expect(footer?.contains(screen.getByRole("button", { name: "Continue" }))).toBe(true);
});

test("renders_no_footer_in_list_variant", () => {
  const { container } = render(
    <PageFrame title="Board" footer={<button type="button">Never</button>}>
      Body
    </PageFrame>,
  );
  expect(slot(container, "page-frame-footer")).toBeNull();
  expect(screen.queryByRole("button", { name: "Never" })).toBeNull();
});

test("primary_replaces_step_in_the_header", () => {
  render(
    <PageFrame title="Review" step="Step 1 of 2" primary={<button type="button">Finish</button>}>
      Body
    </PageFrame>,
  );
  expect(screen.getByRole("button", { name: "Finish" })).toBeTruthy();
  expect(screen.queryByText("Step 1 of 2")).toBeNull();
});

test("compact_picker_hides_the_h1_visually_but_keeps_it", () => {
  render(
    <PageFrame title="Calendar" compactPicker={<button type="button">Week</button>}>
      Body
    </PageFrame>,
  );
  expect(screen.getByRole("button", { name: "Week" })).toBeTruthy();
  const h1 = screen.getByRole("heading", { level: 1, name: "Calendar" });
  expect(h1.className).toContain("sr-only");
  expect(h1.getAttribute("tabindex")).toBe("-1");
});
