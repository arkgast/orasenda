import { render } from "@testing-library/react";
import { expect, expectTypeOf, test } from "vitest";
import { ICON_NAMES, Icon, type IconName } from "./icon.tsx";

const APPROVED: readonly IconName[] = [
  "play",
  "pause",
  "stop",
  "expand",
  "collapse",
  "window",
  "menu",
  "chevron",
  "close",
  "back",
  "alert",
  "info",
  "pages",
  "jump",
  "today",
  "board",
  "inbox",
  "calendar",
  "routines",
  "review",
  "settings",
  "edit",
  "delete",
  "restore",
  "check",
  "more",
  "plus",
];

function svgOf(name: IconName, size?: "md" | "lg"): SVGSVGElement {
  const { container } = render(<Icon name={name} size={size} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("no svg");
  return svg;
}

test("icon_every_name_renders_aria_hidden_svg", () => {
  for (const name of ICON_NAMES) {
    const svg = svgOf(name);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("viewBox")).toBe("0 0 20 20");
    expect(svg.classList.contains("size-icon-lg")).toBe(true);
    expect(svg.querySelectorAll("path,rect,circle").length).toBeGreaterThan(0);
  }
});

test("icon_name_union_matches_runtime_table", () => {
  expect([...ICON_NAMES].sort()).toEqual([...APPROVED].sort());
  expect(ICON_NAMES.length).toBe(27);
  expectTypeOf<IconName>().toEqualTypeOf<(typeof ICON_NAMES)[number]>();
});

test("icon_uses_20px_grid_and_1_5_stroke", () => {
  const svg = svgOf("settings");
  expect(svg.getAttribute("fill")).toBe("none");
  expect(svg.getAttribute("stroke")).toBe("currentColor");
  expect(svg.getAttribute("stroke-width")).toBe("1.5");
  expect(svg.getAttribute("stroke-linecap")).toBe("round");
  expect(svg.getAttribute("stroke-linejoin")).toBe("round");
});

test("icon_size_md_uses_the_md_token_and_default_is_lg", () => {
  expect(svgOf("alert", "md").classList.contains("size-icon-md")).toBe(true);
  expect(svgOf("alert", "md").classList.contains("size-icon-lg")).toBe(false);
  expect(svgOf("alert").classList.contains("size-icon-lg")).toBe(true);
});

test("icon_md_keeps_a_1_5_px_stroke", () => {
  const { container } = render(<Icon name="alert" size="md" />);
  const stroke = Number(container.querySelector("svg")?.getAttribute("stroke-width"));
  expect(stroke * (14 / 20)).toBeCloseTo(1.5, 5);
});

test("more_and_plus_glyphs_exist", () => {
  expect(ICON_NAMES).toContain("more");
  expect(ICON_NAMES).toContain("plus");
  const more = svgOf("more");
  expect(more.getAttribute("aria-hidden")).toBe("true");
  expect(more.getAttribute("stroke")).toBe("currentColor");
  expect(more.getAttribute("stroke-linecap")).toBe("round");
  expect(more.getAttribute("stroke-width")).toBe("1.5");
  // Three dots on the horizontal centre line (y = 10) of the 20-unit grid.
  expect(more.querySelector("path")?.getAttribute("d")).toBe("M4 10h.01M10 10h.01M16 10h.01");
  const plus = svgOf("plus");
  expect(plus.getAttribute("aria-hidden")).toBe("true");
  expect(plus.getAttribute("stroke")).toBe("currentColor");
  // A 13-unit cross centred on (10, 10).
  expect(plus.querySelector("path")?.getAttribute("d")).toBe("M3.5 10h13M10 3.5v13");
});
