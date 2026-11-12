// Generates tokens.css from packages/tokens/tokens.json. Run: node build.ts [--tokens <in>] [--out <out>].
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Json = Record<string, unknown>;
type Decl = [name: string, value: string];

const here = dirname(fileURLToPath(import.meta.url));

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function fail(message: string): never {
  throw new Error(message);
}

const GROUPS = [
  "color",
  "shadow",
  "spacing",
  "radius",
  "duration",
  "easing",
  "size",
  "z-index",
  "breakpoint",
  "container",
];
const THEMED = ["color", "shadow"];
// Styles the reading-comfort setting swaps to --font-alt (design/system/README.md).
const READING_STYLES = ["body", "body-sm", "heading", "title"];
const STYLE_PROPS: [string, string][] = [
  ["fontSize", "font-size"],
  ["lineHeight", "line-height"],
  ["fontWeight", "font-weight"],
  ["letterSpacing", "letter-spacing"],
  ["fontVariantNumeric", "font-variant-numeric"],
];
const STYLE_META = ["name", "sample", "usage"];

function scalar(name: string, v: unknown, known: Set<string>): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string" || v === "") {
    return fail(`token "${name}" has an unknown value shape: ${JSON.stringify(v)}`);
  }
  const out = v.replace(/\{([^{}]*)\}/g, (_, ref: string) => {
    if (!known.has(ref)) fail(`token "${name}" references unknown token "{${ref}}"`);
    return `var(--${ref})`;
  });
  if (/[{}]/.test(out)) fail(`token "${name}" has an unbalanced brace in ${JSON.stringify(v)}`);
  return out;
}

function themed(name: string, v: unknown, known: Set<string>) {
  const o = v as Json | null;
  if (o && typeof o === "object" && "light" in o && "dark" in o) {
    return { light: scalar(name, o.light, known), dark: scalar(name, o.dark, known) };
  }
  return fail(`token "${name}" needs {light, dark} values, got ${JSON.stringify(v)}`);
}

function tokenName(where: string, tok: unknown): string {
  const name = (tok as Json | null)?.name;
  if (typeof name !== "string" || name === "") fail(`a token in "${where}" has no string name`);
  return name;
}

function list(t: Json, group: string): Json[] {
  const g = t[group] as Json | undefined;
  if (!g || !Array.isArray(g.tokens)) fail(`tokens.json has no "${group}.tokens" list`);
  return g.tokens as Json[];
}

function styles(t: Json): { style: Json; family: unknown }[] {
  const type = t.type as Json | undefined;
  if (!type || !Array.isArray(type.groups)) fail('tokens.json has no "type.groups" list');
  return (type.groups as Json[]).flatMap((g, i) => {
    if (!g || !Array.isArray(g.styles)) fail(`type group ${i} ("${g?.name}") has no "styles" list`);
    return (g.styles as Json[]).map((style) => ({ style, family: g.family }));
  });
}

function stackNames(stack: unknown): string[] {
  if (typeof stack !== "string") return [];
  return stack.split(",").map((n) => n.trim().replace(/^"|"$/g, ""));
}

function weightRange(family: string, weight: unknown): [number, number] {
  const parts = typeof weight === "string" ? weight.trim().split(/\s+/).map(Number) : [];
  if (parts.length < 1 || parts.length > 2 || parts.some((n) => !Number.isFinite(n))) {
    return fail(`type.fonts "${family}" has a bad weight ${JSON.stringify(weight)}`);
  }
  return [parts[0], parts[parts.length - 1]];
}

// One @font-face per type.fonts entry, in order. `file` is relative to packages/tokens/.
function fontFaces(t: Json): string {
  const type = t.type as Json;
  const families = type.families as Json;
  const fonts = type.fonts;
  if (!Array.isArray(fonts) || fonts.length === 0) fail('tokens.json has no "type.fonts" list');
  const ranges = new Map<string, [number, number][]>();
  const out = (fonts as Json[]).map((f, i) => {
    const family = f?.family;
    if (typeof family !== "string" || family === "") fail(`type.fonts[${i}] has no string family`);
    const file = f.file;
    if (typeof file !== "string" || !file.endsWith(".woff2")) {
      return fail(`type.fonts "${family}" needs a "file" ending in .woff2`);
    }
    if (file.startsWith("/") || file.split("/").includes("..")) {
      fail(`type.fonts "${family}" file must stay inside packages/tokens: ${file}`);
    }
    if (f.style !== "normal") fail(`type.fonts "${family}" style must be "normal"`);
    if (!Object.values(families).some((s) => stackNames(s).includes(family))) {
      fail(`type.fonts family "${family}" is not named by any type.families stack`);
    }
    ranges.set(family, [...(ranges.get(family) ?? []), weightRange(family, f.weight)]);
    return `@font-face {\n  font-family: "${family}";\n  src: url("./${file}") format("woff2");\n  font-weight: ${f.weight};\n  font-style: normal;\n  font-display: block;\n}\n\n`;
  });
  for (const g of type.groups as Json[]) {
    const family = stackNames(families[g.family as string])[0];
    const familyRanges = ranges.get(family);
    if (!familyRanges)
      fail(`type group "${g.name}" uses "${family}", which has no type.fonts entry`);
    for (const s of g.styles as Json[]) {
      const w = s.fontWeight;
      if (typeof w !== "number" || !familyRanges.some(([lo, hi]) => w >= lo && w <= hi)) {
        fail(`type style "${s.name}" weight ${w} is outside the "${family}" weight range`);
      }
    }
  }
  return out.join("");
}

function generateTokens(t: Json): string {
  for (const key of Object.keys(t)) {
    if (key !== "type" && key !== "fluid" && !GROUPS.includes(key))
      fail(`unknown top-level group "${key}"`);
  }
  const known = new Set<string>();
  for (const group of GROUPS) {
    for (const tok of list(t, group)) known.add(tokenName(group, tok));
  }
  for (const tok of list(t, "fluid")) known.add(tokenName("fluid", tok));
  const light: Decl[] = [];
  const dark: Decl[] = [];

  for (const group of GROUPS) {
    for (const tok of list(t, group)) {
      const name = tokenName(group, tok);
      if (THEMED.includes(group)) {
        const v = themed(name, tok.value, known);
        light.push([name, v.light]);
        dark.push([name, v.dark]);
      } else {
        light.push([name, scalar(name, tok.value, known)]);
      }
    }
  }

  for (const tok of list(t, "fluid")) {
    const name = tokenName("fluid", tok);
    const [lo, hi] = [tok.min, tok.max].map((r) => {
      if (typeof r !== "string" || !known.has(r)) fail(`fluid "${name}" has a bad min or max`);
      return `var(--${r})`;
    });
    if (typeof tok.value !== "string" || !/^\d+(\.\d+)?cqi$/.test(tok.value)) {
      fail(`fluid "${name}" needs a cqi preferred term`);
    }
    light.push([name, `clamp(${lo}, ${tok.value}, ${hi})`]);
  }

  const type = t.type as Json;
  const families = type.families as Json | undefined;
  if (!families || typeof families !== "object") fail('tokens.json has no "type.families"');
  for (const key of Object.keys(families)) {
    light.push([`font-${key}`, scalar(`font-${key}`, families[key], known)]);
  }
  const reading: Decl[] = [];
  for (const { style, family } of styles(t)) {
    const name = tokenName("type styles", style);
    for (const key of Object.keys(style)) {
      if (!STYLE_META.includes(key) && !STYLE_PROPS.some(([k]) => k === key)) {
        fail(`type style "${name}" has unknown property "${key}"`);
      }
    }
    for (const [key, css] of STYLE_PROPS) {
      if (style[key] !== undefined) {
        light.push([`type-${name}-${css}`, scalar(`type-${name}`, style[key], known)]);
      }
    }
    const { fontWeight: w, fontSize: sz, lineHeight: lh } = style;
    for (const [key, v] of [
      ["fontWeight", w],
      ["fontSize", sz],
      ["lineHeight", lh],
    ]) {
      if (v === undefined) fail(`type style "${name}" has no ${key}, so it has no font shorthand`);
    }
    if (typeof family !== "string" || !(family in families)) {
      fail(`type style "${name}" has an unknown group family ${JSON.stringify(family)}`);
    }
    const shorthand = (fam: string) =>
      `${scalar(name, w, known)} ${scalar(name, sz, known)}/${scalar(name, lh, known)} var(--font-${fam})`;
    light.push([`type-${name}`, shorthand(family)]);
    if (READING_STYLES.includes(name)) reading.push([`type-${name}`, shorthand("alt")]);
  }
  for (const n of READING_STYLES) {
    if (!reading.some(([k]) => k === `type-${n}`))
      fail(`reading comfort style "${n}" is not in tokens.json`);
  }

  const block = (ds: Decl[], pad: string) => ds.map(([n, v]) => `${pad}--${n}: ${v};\n`).join("");
  return [
    "/* Generated by build.ts from tokens.json. Do not edit. */\n",
    fontFaces(t),
    `:root {\n${block(light, "  ")}}\n\n`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${block(dark, "    ")}  }\n}\n\n`,
    `:root[data-theme="dark"] {\n${block(dark, "  ")}}\n\n`,
    `[data-reading-comfort="true"] {\n${block(reading, "  ")}}\n`,
  ].join("");
}
function generate(t: Json): { tokens: string; theme: string } {
  return { tokens: generateTokens(t), theme: generateTheme(t) };
}

// shadcn semantic colour name -> Orasenda colour token (spec, Theme mapping).
const SHADCN: [string, string][] = [
  ["background", "surface"],
  ["foreground", "ink"],
  ["card", "surface-raised"],
  ["card-foreground", "ink"],
  ["popover", "surface-raised"],
  ["popover-foreground", "ink"],
  ["primary", "focus"],
  ["primary-foreground", "on-focus"],
  ["secondary", "surface-sunken"],
  ["secondary-foreground", "ink"],
  ["muted", "surface-sunken"],
  ["muted-foreground", "ink-muted"],
  ["accent", "focus-soft"],
  ["accent-foreground", "ink"],
  ["destructive", "critical"],
  ["destructive-foreground", "on-critical"],
  ["border", "line"],
  ["input", "line-strong"],
  ["ring", "focus-ring"],
  ["sidebar", "surface"],
  ["sidebar-foreground", "ink"],
  ["sidebar-border", "line"],
  ["sidebar-accent", "focus-soft"],
  ["sidebar-accent-foreground", "ink"],
  ["sidebar-primary", "focus"],
  ["sidebar-primary-foreground", "on-focus"],
  ["sidebar-ring", "focus-ring"],
];

function generateTheme(t: Json): string {
  const names = (group: string) => list(t, group).map((tok) => tokenName(group, tok));
  const colors = names("color");
  for (const [, target] of SHADCN) {
    if (!colors.includes(target)) fail(`shadcn mapping targets unknown colour "${target}"`);
  }
  const line = (n: string, v: string) => `  --${n}: ${v};\n`;
  // Colours stay in the plain block: --color-<name> points at the themed --<name> from tokens.css.
  let open = "@theme {\n  --*: initial;\n";
  for (const c of colors) open += line(`color-${c}`, `var(--${c})`);
  for (const [s, target] of SHADCN) open += line(`color-${s}`, `var(--color-${target})`);
  // Radius and font tokens are not themed and share their names with Tailwind's keys, so the
  // plain block holds their literal values (a var() to the same name would refer to itself).
  const literal = (v: unknown, name: string) => scalar(name, v, new Set());
  for (const tok of list(t, "radius")) {
    const n = tokenName("radius", tok);
    open += line(n, literal(tok.value, n));
  }
  const families = (t.type as Json).families as Json;
  for (const key of Object.keys(families)) open += line(`font-${key}`, literal(families[key], key));
  // Weights: font-light, font-normal and friends read --font-weight-<name>.
  const weights = (t.type as Json).weights as Json | undefined;
  if (!weights || typeof weights !== "object") fail('tokens.json has no "type.weights"');
  for (const [key, w] of Object.entries(weights)) {
    open += line(`font-weight-${key}`, literal(w, `weight-${key}`));
  }
  open += "}\n\n";
  // Everything else is inline so a utility reads the tokens.css variable directly.
  let inline = "@theme inline {\n";
  const own = (prefix: string, group: string, strip: string) => {
    for (const n of names(group))
      inline += line(`${prefix}-${n.replace(strip, "")}`, `var(--${n})`);
  };
  // Zero is not a design value, so it has no tokens.json entry: `m-0`, `min-w-0`, `inset-0` need it.
  inline += line("spacing-0", "0px");
  own("spacing", "spacing", "space-");
  own("ease", "easing", "easing-");
  for (const n of names("size")) inline += line(`spacing-${n}`, `var(--${n})`);
  for (const n of names("fluid")) inline += line(`spacing-${n}`, `var(--${n})`);
  for (const { style } of styles(t)) {
    const n = tokenName("type styles", style);
    inline += line(`text-${n}`, `var(--type-${n}-font-size)`);
    inline += line(`text-${n}--line-height`, `var(--type-${n}-line-height)`);
    inline += line(`text-${n}--font-weight`, `var(--type-${n}-font-weight)`);
    if (style.letterSpacing !== undefined) {
      inline += line(`text-${n}--letter-spacing`, `var(--type-${n}-letter-spacing)`);
    }
  }
  // Breakpoints and containers hold literal lengths: a media query cannot read a variable.
  for (const tok of list(t, "breakpoint")) {
    const n = tokenName("breakpoint", tok);
    inline += line(n, String(tok.value));
  }
  for (const tok of list(t, "container")) {
    const n = tokenName("container", tok);
    inline += line(n, String(tok.value));
  }
  inline += "}\n\n";
  // Tailwind has no theme namespace for these two, so each token is a small utility.
  let utils = "";
  for (const n of names("duration")) {
    utils += `@utility ${n} {\n  transition-duration: var(--${n});\n}\n\n`;
  }
  // Shadows are themed and named like Tailwind's keys, so they are utilities too.
  for (const n of names("shadow")) {
    utils += `@utility ${n} {\n  box-shadow: var(--${n});\n}\n\n`;
  }
  for (const n of names("z-index")) {
    utils += `@utility ${n} {\n  z-index: var(--${n});\n}\n\n`;
  }
  return (
    `/* Generated by build.ts from tokens.json. Do not edit. */\n${open}${inline}${utils}`.trimEnd() +
    "\n"
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = arg("--tokens", join(here, "tokens.json"));
  const out = arg("--out", join(here, "tokens.css"));
  try {
    const themeOut = arg("--theme", join(dirname(out), "theme.css"));
    const built = generate(JSON.parse(readFileSync(input, "utf8")));
    writeFileSync(out, built.tokens);
    writeFileSync(themeOut, built.theme);
  } catch (e) {
    console.error(`tokens build failed: ${(e as Error).message}`);
    process.exit(1);
  }
}
