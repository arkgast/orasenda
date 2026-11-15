import { render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PopoverMenu } from "./popover-menu";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const PANEL = '[data-slot="popover-menu"]';
const ITEMS = [
  { id: "a", label: "Alpha", kind: "link" as const },
  { id: "b", label: "Beta", kind: "link" as const },
];

// jsdom has no layout: the viewport, the anchor and the panel's natural size are set by hand.
function setup(opts: {
  viewport: [number, number];
  anchor: { left: number; top: number; width: number; height: number };
  panel: [number, number];
}) {
  const [vw, vh] = opts.viewport;
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(vw);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(vh);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(opts.panel[1]);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(opts.panel[0]);
  const a = opts.anchor;
  const anchor = createRef<HTMLButtonElement>();
  const rect = {
    ...a,
    right: a.left + a.width,
    bottom: a.top + a.height,
    x: a.left,
    y: a.top,
    toJSON() {},
  } as DOMRect;
  render(
    <>
      <button
        type="button"
        ref={(el) => {
          anchor.current = el;
          if (el) el.getBoundingClientRect = () => rect;
        }}
      >
        More
      </button>
      <PopoverMenu
        heading="Actions"
        items={ITEMS}
        anchor={anchor}
        onSelect={() => {}}
        onClose={() => {}}
      />
    </>,
  );
  return () => document.querySelector(PANEL)?.getAttribute("data-side");
}

beforeEach(() => {
  document.documentElement.style.setProperty("--space-1", "4px");
  document.documentElement.style.setProperty("--space-2", "8px");
});
afterEach(() => vi.restoreAllMocks());

test("popover_menu_goes_below_when_it_fits_below", () => {
  const side = setup({
    viewport: [640, 480],
    anchor: { left: 20, top: 20, width: 44, height: 44 },
    panel: [260, 270],
  });
  expect(side()).toBe("bottom");
});

test("popover_menu_goes_above_when_it_fits_only_above", () => {
  const side = setup({
    viewport: [640, 480],
    anchor: { left: 20, top: 400, width: 44, height: 44 },
    panel: [260, 270],
  });
  expect(side()).toBe("top");
});

test("popover_menu_goes_beside_on_the_end_side_when_neither_below_nor_above_fits", () => {
  const side = setup({
    viewport: [640, 480],
    anchor: { left: 20, top: 200, width: 44, height: 44 },
    panel: [260, 270],
  });
  expect(side()).toBe("right");
});

test("popover_menu_goes_to_the_start_side_when_the_end_side_is_too_narrow", () => {
  const side = setup({
    viewport: [640, 480],
    anchor: { left: 560, top: 200, width: 44, height: 44 },
    panel: [260, 270],
  });
  expect(side()).toBe("left");
});

test("popover_menu_falls_back_to_below_when_nothing_fits", () => {
  const side = setup({
    viewport: [300, 300],
    anchor: { left: 130, top: 120, width: 44, height: 44 },
    panel: [260, 270],
  });
  expect(side()).toBe("bottom");
});
