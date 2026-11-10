import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ScrollRegion } from "./scroll-region";

function stubLayout(scrollHeight: number, clientHeight: number): () => void {
  const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
  return () => {
    if (sh) Object.defineProperty(HTMLElement.prototype, "scrollHeight", sh);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
    if (ch) Object.defineProperty(HTMLElement.prototype, "clientHeight", ch);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  };
}

test("scroll_region_is_labelled_region_with_hidden_more_below_row", () => {
  const restore = stubLayout(500, 100);
  try {
    const { container } = render(
      <ScrollRegion label="Settings">
        <p>long</p>
      </ScrollRegion>,
    );
    const region = screen.getByRole("region", { name: "Settings" });
    expect(region).toHaveAttribute("data-slot", "scroll-region");
    const more = container.querySelector("[data-slot=scroll-region-more]") as HTMLElement;
    expect(more).not.toBeNull();
    expect(more).toHaveAttribute("aria-hidden", "true");
    expect(more).toHaveTextContent("More below");
    expect(region.tabIndex).toBe(0);
  } finally {
    restore();
  }
});

test("scroll_region_with_focusable_child_is_not_a_tab_stop", () => {
  const { container } = render(
    <ScrollRegion label="Settings">
      <button type="button">Go</button>
    </ScrollRegion>,
  );
  expect(screen.getByRole("region", { name: "Settings" }).hasAttribute("tabindex")).toBe(false);
  expect(container.querySelector("[data-slot=scroll-region-more]")).toBeNull();
});

test("scroll_region_remeasures_when_content_grows", async () => {
  let h = 50;
  const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => h,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 100,
  });
  try {
    const { container } = render(
      <ScrollRegion label="Settings">
        <div id="grow">short</div>
      </ScrollRegion>,
    );
    expect(container.querySelector("[data-slot=scroll-region-more]")).toBeNull();
    h = 500;
    (container.querySelector("#grow") as HTMLElement).append("more");
    await vi.waitFor(() =>
      expect(container.querySelector("[data-slot=scroll-region-more]")).not.toBeNull(),
    );
  } finally {
    if (sh) Object.defineProperty(HTMLElement.prototype, "scrollHeight", sh);
    if (ch) Object.defineProperty(HTMLElement.prototype, "clientHeight", ch);
  }
});
