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

test("os_choice_checkbox_is_not_a_round_dot", () => {
  const css = readFileSync(join(here, "components.css"), "utf8");
  const rule = /\.os-choice input\[type="checkbox"\]\s*\{([^}]*)\}/.exec(css);
  expect(rule, "checkbox rule missing").not.toBeNull();
  const radius = /border-radius:\s*([^;]+);/.exec(rule?.[1] ?? "");
  expect(radius?.[1]).toBeDefined();
  expect(radius?.[1]).not.toContain("var(--radius-pill)");
  expect(css).toMatch(/\.os-choice input\[type="checkbox"\]:checked::before/);
});
