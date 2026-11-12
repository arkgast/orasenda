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
  "calendar",
  "routines",
  "review",
  "settings",
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
  expect(ICON_NAMES.length).toBe(20);
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
