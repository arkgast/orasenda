// Generates tokens.css from design/system/tokens.json. Run: node build.ts [--tokens <in>] [--out <out>].
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

const GROUPS = ["color", "shadow", "spacing", "radius", "duration", "easing", "size", "z-index"];
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
  const ranges = new Map<string, [number, number]>();
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
    ranges.set(family, weightRange(family, f.weight));
    return `@font-face {\n  font-family: "${family}";\n  src: url("./${file}") format("woff2");\n  font-weight: ${f.weight};\n  font-style: normal;\n  font-display: block;\n}\n\n`;
  });
  for (const g of type.groups as Json[]) {
    const family = stackNames(families[g.family as string])[0];
    const range = ranges.get(family);
    if (!range) fail(`type group "${g.name}" uses "${family}", which has no type.fonts entry`);
    for (const s of g.styles as Json[]) {
      const w = s.fontWeight;
      if (typeof w !== "number" || w < range[0] || w > range[1]) {
        fail(`type style "${s.name}" weight ${w} is outside the "${family}" weight range`);
      }
    }
  }
  return out.join("");
}

function generate(t: Json): string {
  for (const key of Object.keys(t)) {
    if (key !== "type" && !GROUPS.includes(key)) fail(`unknown top-level group "${key}"`);
  }
  const known = new Set<string>();
  for (const group of GROUPS) {
    for (const tok of list(t, group)) known.add(tokenName(group, tok));
  }
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
    "/* Generated by build.ts from design/system/tokens.json. Do not edit. */\n",
    fontFaces(t),
    `:root {\n${block(light, "  ")}}\n\n`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${block(dark, "    ")}  }\n}\n\n`,
    `:root[data-theme="dark"] {\n${block(dark, "  ")}}\n\n`,
    `[data-reading-comfort="true"] {\n${block(reading, "  ")}}\n`,
  ].join("");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = arg("--tokens", join(here, "..", "..", "design", "system", "tokens.json"));
  const out = arg("--out", join(here, "tokens.css"));
  try {
    writeFileSync(out, generate(JSON.parse(readFileSync(input, "utf8"))));
  } catch (e) {
    console.error(`tokens build failed: ${(e as Error).message}`);
    process.exit(1);
  }
}
