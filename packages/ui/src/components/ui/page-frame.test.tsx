import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import * as ui from "../../index";
import { PageFrame } from "./page-frame";

const slot = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-slot=${name}]`);

test("exposes_heading_with_name", () => {
  render(<PageFrame title="Settings">Body</PageFrame>);
  const h1 = screen.getByRole("heading", { level: 1, name: "Settings" });
  expect(h1.getAttribute("tabindex")).toBe("-1");
});

test("renders_list_header_status_and_region_in_order", () => {
  const { container } = render(
    <PageFrame title="Inbox" primary={<button type="button">Plan the day</button>} status="Saved">
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
    <PageFrame title="Inbox" footer={<button type="button">Never</button>}>
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
  expect(h1.getAttribute("tabindex")).toBe("-1");
});

test("page_frame_renders_h1_and_three_tracks", () => {
  const { container, rerender } = render(
    <PageFrame title="Settings" status={<span>s</span>}>
      <p>body</p>
    </PageFrame>,
  );
  const h1 = screen.getByRole("heading", { level: 1, name: "Settings" });
  expect(h1.tabIndex).toBe(-1);
  const root = container.firstElementChild as HTMLElement;
  expect(root.getAttribute("data-slot")).toBe("page-frame");
  expect(root.children).toHaveLength(3);
  expect(root.children[0].getAttribute("data-slot")).toBe("page-frame-header");
  expect(root.children[0].contains(h1)).toBe(true);
  expect(root.children[1].textContent).toBe("s");
  expect(root.children[2].textContent).toBe("body");

  rerender(<PageFrame title="Settings" />);
  expect((container.firstElementChild as HTMLElement).children).toHaveLength(3);

  rerender(
    <PageFrame
      title="Shutdown"
      variant="flow"
      step="Step 2 of 4"
      footer={<button type="button">Continue</button>}
    />,
  );
  const flow = container.firstElementChild as HTMLElement;
  expect(flow.getAttribute("data-variant")).toBe("flow");
  expect(flow.children).toHaveLength(4);
  expect(flow.children[3].textContent).toBe("Continue");
  expect(screen.getByText("Step 2 of 4")).toBeTruthy();
});

test("index_exports_the_tsx_page_frame", () => {
  expect(ui.PageFrame).toBe(PageFrame);
});

test("content_width_wraps_header_and_status_in_inset_columns", () => {
  const { container } = render(
    <PageFrame
      title="Inbox"
      width="content"
      primary={<button type="button">Add</button>}
      status="Saved"
    >
      Body
    </PageFrame>,
  );
  for (const [name, host] of [
    ["page-frame-header-column", "page-frame-header"],
    ["page-frame-status-column", "page-frame-status"],
  ] as const) {
    const column = slot(container, name) as HTMLElement;
    expect(column.className).toContain("mx-auto");
    expect(column.className).toContain("w-full");
    expect(column.className).toContain("max-w-content-width");
    const scrollbar = column.parentElement as HTMLElement;
    expect(scrollbar.className).toContain("pe-scrollbar-size");
    const inset = scrollbar.parentElement as HTMLElement;
    expect(inset.className).toContain("ps-2");
    expect(inset.className).toContain("pe-2");
    expect(inset.parentElement).toBe(slot(container, host));
  }
  const header = slot(container, "page-frame-header-column") as HTMLElement;
  expect(header.className).toContain("justify-between");
  expect(header.contains(screen.getByRole("heading", { level: 1 }))).toBe(true);
  expect(header.contains(screen.getByRole("button", { name: "Add" }))).toBe(true);
  expect(slot(container, "page-frame-status-column")?.textContent).toBe("Saved");
});

test("default_width_unchanged", () => {
  const { container } = render(
    <PageFrame title="Inbox" primary={<button type="button">Add</button>} status="Saved">
      Body
    </PageFrame>,
  );
  expect(slot(container, "page-frame-header-column")).toBeNull();
  expect(slot(container, "page-frame-status-column")).toBeNull();
  expect(slot(container, "page-frame-header")?.className).toBe(
    "flex h-hit-min shrink-0 items-center justify-between gap-3",
  );
  expect(slot(container, "page-frame-status")?.className).toBe("h-hit-min shrink-0");
  expect(slot(container, "page-frame-body")?.className).toBe(
    "flex flex-1 flex-col overflow-hidden p-1 *:flex-1",
  );
});
