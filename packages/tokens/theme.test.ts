import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";

const here = dirname(fileURLToPath(import.meta.url));
// biome-ignore lint/suspicious/noExplicitAny: tokens.json is read loosely
type Loose = Record<string, any>;
const tokens: Loose = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));

const scratch = mkdtempSync(join(tmpdir(), "theme-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function buildTheme(): string {
  const run = spawnSync(
    process.execPath,
    [join(here, "build.ts"), "--out", join(scratch, "tokens.css")],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  return readFileSync(join(scratch, "theme.css"), "utf8");
}

async function utilities(theme: string, candidates: string[]): Promise<string> {
  const compiler = await compile(`${theme}\n@tailwind utilities;`);
  return compiler.build(candidates);
}

test("theme_is_closed", async () => {
  const theme = buildTheme();
  assert.match(theme, /@theme\s*\{\s*--\*: initial;/);
  const css = await utilities(theme, ["bg-red-500", "p-3.5", "text-red-500", "rounded-xl"]);
  assert.doesNotMatch(css, /^\.[^\s{]+ \{/m);
  const ok = await utilities(theme, ["bg-surface-raised", "p-4", "p-1-5", "rounded-md"]);
  assert.match(ok, /\.bg-surface-raised/);
  assert.match(ok, /\.p-1-5/);
  assert.match(ok, /\.rounded-md/);
});

test("theme_has_font_weights", async () => {
  const theme = buildTheme();
  const css = await utilities(theme, [
    "font-semibold",
    "font-medium",
    "font-light",
    "font-normal",
    "font-bold",
  ]);
  assert.match(css, /\.font-semibold \{[^}]*font-weight: var\(--font-weight-semibold\)/);
  assert.match(css, /\.font-medium \{[^}]*font-weight: var\(--font-weight-medium\)/);
  assert.match(css, /--font-weight-semibold: 600;/);
  assert.match(css, /--font-weight-medium: 500;/);
  assert.match(css, /\.font-light \{[^}]*font-weight: var\(--font-weight-light\)/);
  assert.match(css, /\.font-normal \{[^}]*font-weight: var\(--font-weight-normal\)/);
  assert.doesNotMatch(css, /\.font-bold/);
});

test("theme_maps_destructive_to_critical", async () => {
  const theme = buildTheme();
  assert.match(theme, /--color-destructive: var\(--color-critical\);/);
  assert.match(theme, /--color-destructive-foreground: var\(--color-on-critical\);/);
  assert.match(theme, /--color-primary: var\(--color-focus\);/);
  const css = await utilities(theme, ["bg-primary", "bg-destructive"]);
  assert.match(css, /--color-primary: var\(--color-focus\)/);
  assert.match(css, /--color-destructive: var\(--color-critical\)/);
});

function px(name: string): number {
  for (const g of Object.values(tokens) as Loose[]) {
    const t = Array.isArray(g?.tokens) ? g.tokens.find((x: Loose) => x.name === name) : undefined;
    if (t) return Number.parseFloat(t.value);
  }
  throw new Error(`no token ${name}`);
}

test("fluid_tokens_stay_within_bounds", () => {
  const fluid: Loose[] = tokens.fluid.tokens;
  assert.ok(fluid.length > 0);
  const theme = buildTheme();
  const css = readFileSync(join(scratch, "tokens.css"), "utf8");
  for (const f of fluid) {
    const min = px(f.min);
    const max = px(f.max);
    const m = /^(\d+(?:\.\d+)?)cqi$/.exec(f.value);
    assert.ok(m, `${f.name} needs a cqi preferred term`);
    assert.ok(min < max, `${f.name} min is below max`);
    // The generated css clamps between exactly the declared tokens, min first.
    assert.ok(
      css.includes(`--${f.name}: clamp(var(--${f.min}), ${m[1]}cqi, var(--${f.max}));`),
      `${f.name} is clamp(var(--${f.min}), ${m[1]}cqi, var(--${f.max})) in tokens.css`,
    );
    // The ramp is reached, so the term is not a dead constant.
    assert.ok((Number(m[1]) * 390) / 100 <= max, `${f.name} starts at or below max`);
    assert.ok((Number(m[1]) * 1536) / 100 >= max, `${f.name} reaches max by 1536`);
  }
  assert.match(theme, /--spacing-fluid-gutter: var\(--fluid-gutter\);/);
});

test("responsive_tokens_match_tailwind_sizes", () => {
  const theme = buildTheme();
  for (const [n, v] of [
    ["sm", 640],
    ["md", 768],
    ["lg", 1024],
    ["xl", 1280],
    ["2xl", 1536],
  ] as const) {
    assert.match(theme, new RegExp(`--breakpoint-${n}: ${v}px;`));
  }
  assert.match(theme, /--container-3xs: 256px;/);
  assert.match(theme, /--container-7xl: 1280px;/);
});

test("theme_has_a_zero_spacing_step", async () => {
  const theme = buildTheme();
  assert.match(theme, /--spacing-0: 0px;/);
  const css = await utilities(theme, ["m-0", "min-w-0", "inset-0", "p-0", "top-0"]);
  for (const name of ["m-0", "min-w-0", "inset-0", "p-0", "top-0"]) {
    assert.ok(css.includes(`.${name} {`), `${name} emits CSS`);
  }
});

test("theme_has_no_stale_preflight_comment_or_box_sizing_rule", () => {
  const theme = buildTheme();
  assert.doesNotMatch(theme, /Preflight is off/);
  assert.doesNotMatch(theme, /box-sizing/);
  assert.doesNotMatch(theme, /@layer base/);
});
