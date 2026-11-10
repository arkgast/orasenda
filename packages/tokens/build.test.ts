import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const realTokens = join(here, "tokens.json");
// biome-ignore lint/suspicious/noExplicitAny: test fixtures are mutated freely
type Loose = Record<string, any>;
const tokens: Loose = JSON.parse(readFileSync(realTokens, "utf8"));

const scratch = mkdtempSync(join(tmpdir(), "tokens-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function build(input: string = realTokens) {
  const out = join(scratch, "tokens.css");
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
  assert.match(dark, /:root:not\(\[data-theme="light"\]\) \{/);
  assert.match(dark, /--surface: #121a1d;/);
  assert.match(dark, /--shadow-raised: 0 1px 2px rgba\(0, 0, 0, 0.35\)/);
});

test("emits_every_token_in_tokens_json", () => {
  const { css } = build();
  const names: unknown[] = Object.values(tokens)
    .filter((g: Loose) => Array.isArray(g?.tokens))
    .flatMap((g: Loose) => g.tokens)
    .map((t: Loose) => t.name);
  assert.ok(names.length > 60);
  for (const name of names) {
    assert.equal(typeof name, "string");
    assert.ok(css.includes(`--${name}:`), `missing --${name}`);
  }
  assert.match(css, /--z-overlay: 1000;/);
  assert.doesNotMatch(css, /@import/);
  assert.doesNotMatch(css, /url\((?!"\.\/fonts\/)/);
});

test("emits_type_style_properties", () => {
  const { css } = build();
  assert.match(css, /--type-timer-md-font-size: 28px;/);
  assert.match(css, /--type-timer-md-line-height: 32px;/);
  assert.match(css, /--type-timer-xl-line-height: 1;/);
  assert.match(css, /--type-timer-md-font-weight: 400;/);
  assert.match(css, /--type-label-letter-spacing: 0.06em;/);
  assert.match(css, /--type-timer-md-font-variant-numeric: tabular-nums;/);
  const css_names: Record<string, string> = {
    fontSize: "font-size",
    lineHeight: "line-height",
    fontWeight: "font-weight",
    letterSpacing: "letter-spacing",
    fontVariantNumeric: "font-variant-numeric",
  };
  for (const g of tokens.type.groups)
    for (const s of g.styles)
      for (const [key, css_name] of Object.entries(css_names))
        if (key in s) assert.ok(css.includes(`--type-${s.name}-${css_name}:`), `${s.name} ${key}`);
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

function buildBad(mutate: (t: Loose) => void) {
  const bad = structuredClone(tokens);
  mutate(bad);
  const file = join(scratch, "bad.json");
  writeFileSync(file, JSON.stringify(bad));
  return build(file).run;
}

function assertFails(mutate: (t: Loose) => void, needle: RegExp) {
  const run = buildBad(mutate);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, needle);
}

test("unknown_token_shape_fails_with_message", () => {
  assertFails((t) => {
    t.spacing.tokens[0].value = { nope: true };
  }, /space-1/);
});

test("unknown_reference_fails_naming_token", () => {
  assertFails((t) => {
    t.color.tokens.find((c: Loose) => c.name === "selection").value.light = "{focus-sfot}";
  }, /selection.*focus-sfot/);
});

test("unbalanced_brace_fails_naming_token", () => {
  assertFails((t) => {
    t.shadow.tokens[0].value.light = "0 0 0 2px {focus";
  }, /shadow-raised/);
});

test("unknown_top_level_group_fails", () => {
  assertFails((t) => {
    t.motion = { tokens: [] };
  }, /motion/);
});

test("unknown_type_style_key_fails", () => {
  assertFails((t) => {
    t.type.groups[0].styles[0].textTransform = "uppercase";
  }, /timer-xl.*textTransform/);
});

test("nameless_token_fails", () => {
  assertFails((t) => {
    delete t.radius.tokens[0].name;
  }, /radius/);
});

test("type_group_without_styles_fails", () => {
  assertFails((t) => {
    delete t.type.groups[1].styles;
  }, /Text/);
});

test("output_is_deterministic", () => {
  assert.equal(build().css, build().css);
});

test("emits_a_font_shorthand_per_type_style", () => {
  const { root } = blocks(build().css);
  assert.match(root, /--type-body-sm: 400 13px\/18px var\(--font-sans\);/);
  assert.match(root, /--type-timer-xl: 300 168px\/1 var\(--font-mono\);/);
  assert.match(root, /--type-body-alt: 400 15px\/24px var\(--font-alt\);/);
});

test("reading_comfort_swaps_the_four_text_shorthands_to_the_alt_family", () => {
  const { css } = build();
  const at = css.indexOf('[data-reading-comfort="true"] {');
  assert.notEqual(at, -1, "reading comfort block missing");
  const block = css.slice(at, css.indexOf("}", at));
  assert.match(block, /--type-body: 400 15px\/22px var\(--font-alt\);/);
  assert.match(block, /--type-body-sm: 400 13px\/18px var\(--font-alt\);/);
  assert.match(block, /--type-heading: 600 17px\/24px var\(--font-alt\);/);
  assert.match(block, /--type-title: 600 22px\/28px var\(--font-alt\);/);
  assert.doesNotMatch(block, /timer|display|label|caption/);
});

test("type_style_with_unknown_family_fails", () => {
  assertFails((t) => {
    t.type.groups[1].family = "serif";
  }, /unknown group family "serif"/);
});

test("type_style_missing_a_shorthand_key_fails", () => {
  assertFails((t) => {
    delete t.type.groups[1].styles.find((s: Loose) => s.name === "body").lineHeight;
  }, /"body".*lineHeight/);
});

test("dark_block_guarded_and_repeated_under_data_theme_dark", () => {
  const { css } = build();
  const media = "@media (prefers-color-scheme: dark) {";
  const start = css.indexOf(media);
  assert.notEqual(start, -1);
  const guardSel = ':root:not([data-theme="light"]) {';
  const g = css.indexOf(guardSel, start);
  assert.notEqual(g, -1, "guarded selector missing");
  const gEnd = css.indexOf("}", g);
  const mediaEnd = css.indexOf("\n}\n", gEnd);
  assert.ok(g < mediaEnd, "guard must be inside the media query");
  const decls = (s: string) => s.match(/--[a-z0-9-]+: [^;]+;/g) ?? [];
  const guarded = decls(css.slice(g + guardSel.length, gEnd));
  const explicitSel = ':root[data-theme="dark"] {';
  const e = css.indexOf(explicitSel);
  assert.ok(e > mediaEnd, "data-theme dark block must be outside the media query");
  const explicit = decls(css.slice(e + explicitSel.length, css.indexOf("}", e)));
  assert.ok(guarded.length > 0);
  assert.ok(guarded.includes("--surface: #121a1d;"));
  assert.deepEqual(explicit, guarded);
});

test("emits_font_face_per_type_fonts_entry", () => {
  const { css } = build();
  const fonts: Loose[] = tokens.type.fonts;
  assert.equal(fonts.length, 3);
  assert.equal(css.split("@font-face {").length - 1, fonts.length);
  for (const f of fonts) {
    assert.ok(css.includes(`font-family: "${f.family}";`), `no @font-face for ${f.family}`);
    assert.ok(css.includes(`font-weight: ${f.weight};`), `no weight ${f.weight}`);
  }
  assert.equal(css.split("font-style: normal;").length - 1, fonts.length);
  assert.equal(css.split("font-display: block;").length - 1, fonts.length);
});

test("font_face_src_is_relative_woff2_url", () => {
  const { css } = build();
  for (const f of tokens.type.fonts as Loose[]) {
    assert.ok(css.includes(`src: url("./${f.file}") format("woff2");`), `src for ${f.file}`);
    assert.ok(existsSync(join(here, f.file)), `${f.file} is not on disk`);
  }
  assert.doesNotMatch(css, /http|\/\/|googleapis|gstatic/);
});

test("font_faces_come_before_root_block", () => {
  const { css } = build();
  assert.ok(css.lastIndexOf("@font-face {") < css.indexOf(":root {"));
});

test("type_fonts_entry_without_file_fails", () => {
  assertFails((t) => {
    delete t.type.fonts[0].file;
  }, /Atkinson Hyperlegible Next.*file|file/);
});

test("type_fonts_family_not_in_families_fails", () => {
  assertFails((t) => {
    t.type.fonts[0].family = "Comic Sans";
  }, /Comic Sans/);
});

test("every_weight_a_type_style_uses_is_inside_a_font_range", () => {
  const first = (stack: string) => stack.split(",")[0].trim().replace(/"/g, "");
  const inside = (w: number, range: string) => {
    const [lo, hi = lo] = range.split(" ").map(Number);
    return w >= lo && w <= hi;
  };
  for (const g of tokens.type.groups as Loose[]) {
    const font = (tokens.type.fonts as Loose[]).find(
      (f) => f.family === first(tokens.type.families[g.family]),
    );
    assert.ok(font, `no font for group ${g.name}`);
    for (const s of g.styles as Loose[]) assert.ok(inside(s.fontWeight, font.weight), s.name);
  }
  assertFails((t) => {
    t.type.fonts[2].weight = "500";
  }, /Lexend|weight/);
  assertFails((t) => {
    t.type.groups[0].styles[0].fontWeight = 900;
  }, /weight/);
});
