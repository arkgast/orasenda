import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const realTokens = join(here, "..", "..", "design", "system", "tokens.json");
const tokens = JSON.parse(readFileSync(realTokens, "utf8"));

function build(input: string = realTokens) {
  const out = join(mkdtempSync(join(tmpdir(), "tokens-")), "tokens.css");
  const run = spawnSync(
    process.execPath,
    [join(here, "build.ts"), "--tokens", input, "--out", out],
    { encoding: "utf8" },
  );
  return { run, css: run.status === 0 ? readFileSync(out, "utf8") : "" };
}

function blocks(css: string) {
  const at = css.indexOf("@media (prefers-color-scheme: dark)");
  assert.notEqual(at, -1, "dark media block missing");
  return { root: css.slice(0, at), dark: css.slice(at) };
}

test("emits_light_color_in_root", () => {
  const { root } = blocks(build().css);
  assert.match(root, /:root \{/);
  assert.match(root, /--surface: #f4f2ed;/);
  assert.match(root, /--selection: var\(--focus-soft\);/);
});

test("emits_dark_color_under_prefers_color_scheme_dark", () => {
  const { dark } = blocks(build().css);
  assert.match(dark, /:root \{/);
  assert.match(dark, /--surface: #121a1d;/);
  assert.match(dark, /--shadow-raised: 0 1px 2px rgba\(0, 0, 0, 0.35\)/);
});

test("emits_every_token_in_tokens_json", () => {
  const { css } = build();
  const names: string[] = [
    ...tokens.color.tokens,
    ...tokens.spacing.tokens,
    ...tokens.radius.tokens,
    ...tokens.shadow.tokens,
    ...tokens.duration.tokens,
    ...tokens.easing.tokens,
    ...tokens.size.tokens,
    ...tokens["z-index"].tokens,
  ].map((t) => t.name);
  assert.ok(names.length > 60);
  for (const name of names) {
    assert.ok(css.includes(`--${name}:`), `missing --${name}`);
  }
  assert.match(css, /--z-overlay: 1000;/);
  assert.doesNotMatch(css, /@import|url\(/);
});

test("emits_type_style_properties", () => {
  const { css } = build();
  assert.match(css, /--type-timer-md-font-size: 28px;/);
  assert.match(css, /--type-timer-md-line-height: 32px;/);
  assert.match(css, /--type-timer-xl-line-height: 1;/);
  assert.match(css, /--type-timer-md-font-weight: 400;/);
  assert.match(css, /--type-label-letter-spacing: 0.06em;/);
  assert.match(css, /--type-timer-md-font-variant-numeric: tabular-nums;/);
  for (const g of tokens.type.groups)
    for (const s of g.styles) assert.ok(css.includes(`--type-${s.name}-font-size:`), s.name);
});

test("emits_font_families", () => {
  const { css } = build();
  assert.match(css, /--font-sans: "Atkinson Hyperlegible Next"/);
  assert.match(css, /--font-mono: "Atkinson Hyperlegible Mono"/);
  assert.match(css, /--font-alt: Lexend/);
});

test("token_without_dark_value_has_no_dark_override", () => {
  const { dark } = blocks(build().css);
  assert.doesNotMatch(dark, /--space-1:/);
  assert.doesNotMatch(dark, /--control-sm:/);
  assert.doesNotMatch(dark, /--z-rail:/);
});

test("unknown_token_shape_fails_with_message", () => {
  const bad = structuredClone(tokens);
  bad.spacing.tokens[0].value = { nope: true };
  const file = join(mkdtempSync(join(tmpdir(), "bad-")), "tokens.json");
  writeFileSync(file, JSON.stringify(bad));
  const { run } = build(file);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /space-1/);
});

test("output_is_deterministic", () => {
  assert.equal(build().css, build().css);
});
