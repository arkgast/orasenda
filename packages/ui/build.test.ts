import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "ui-css-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function build(name: string): string {
  const out = join(scratch, name);
  const run = spawnSync(process.execPath, [join(here, "build.ts"), "--out", out], {
    encoding: "utf8",
  });
  expect(run.status, run.stderr).toBe(0);
  return readFileSync(out, "utf8");
}

test("components_css_has_no_import_or_url", () => {
  const css = readFileSync(join(here, "components.css"), "utf8");
  expect(css).not.toMatch(/@import/);
  expect(css).not.toMatch(/url\(|https?:\/\//);
  expect(css).toContain(".");
});

test("components_css_is_deterministic", () => {
  const a = build("a.css");
  expect(build("b.css")).toBe(a);
  expect(readFileSync(join(here, "components.css"), "utf8")).toBe(a);
});

function ruleBody(css: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[1];
}

function declaration(body: string | undefined, prop: string): string | undefined {
  return new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`).exec(body ?? "")?.[1]?.trim();
}

function checkChoiceShapes(css: string): void {
  const base = declaration(ruleBody(css, ".os-choice input"), "border-radius");
  const box = ruleBody(css, '.os-choice input[type="checkbox"]');
  expect(box, "checkbox rule missing").toBeDefined();
  const radius = declaration(box, "border-radius");
  expect(radius, "checkbox border-radius missing").toBeDefined();
  expect(radius).not.toBe(base);
  expect(radius).not.toContain("var(--radius-pill)");
  expect(radius).not.toContain("50%");
  for (const px of radius?.matchAll(/(\d+(?:\.\d+)?)px/g) ?? []) {
    expect(Number(px[1])).toBeLessThan(7);
  }
  const tick = ruleBody(css, '.os-choice input[type="checkbox"]:checked::before');
  expect(tick, "tick rule missing").toBeDefined();
  expect(tick).toMatch(/content:/);
  const width = declaration(tick, "border-width");
  expect(width, "tick border-width missing").toBeDefined();
  expect(width).toMatch(/[1-9]/);
}

test("os_choice_checkbox_is_not_a_round_dot", () => {
  checkChoiceShapes(readFileSync(join(here, "components.css"), "utf8"));
});

test("os_choice_shape_check_rejects_round_or_tickless_checkbox", () => {
  const css = readFileSync(join(here, "components.css"), "utf8");
  const round = css.replace(
    /(\.os-choice input\[type="checkbox"\] \{[^}]*)border-radius:[^;]+;/,
    "$1border-radius: var(--radius-pill);",
  );
  expect(round).not.toBe(css);
  expect(() => checkChoiceShapes(round)).toThrow();
  const flat = css.replace(/border-width: 0 2px 2px 0;/, "border-width: 0;");
  expect(flat).not.toBe(css);
  expect(() => checkChoiceShapes(flat)).toThrow();
});
