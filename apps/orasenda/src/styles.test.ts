import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test } from "vitest";

// Read as text: Vitest replaces CSS imports (even `?raw`) with an empty string. Paths, not
// `URL`s: jsdom's global `URL` is not one `node:fs` accepts.
const stylesDir = join(import.meta.dirname, "styles");
const cssFiles = readdirSync(stylesDir, { recursive: true, encoding: "utf8" })
  .filter((name) => name.endsWith(".css"))
  .map((name) => ({ name, css: readFileSync(join(stylesDir, name), "utf8") }));
const appCss = readFileSync(join(stylesDir, "app.css"), "utf8");
const mainTsx = readFileSync(join(import.meta.dirname, "main.tsx"), "utf8");
const tokensCss = readFileSync(
  createRequire(import.meta.filename).resolve("@orasenda/tokens/tokens.css"),
  "utf8",
);

type Rule = { selector: string; declarations: Map<string, string> };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  for (const match of stripComments(css).matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const declaration of (match[2] ?? "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
    }
    rules.push({ selector: (match[1] ?? "").trim(), declarations });
  }
  return rules;
}

function rule(selector: string): Map<string, string> {
  const found = parseRules(appCss).find((candidate) => candidate.selector === selector);
  if (!found) throw new Error(`app.css has no rule for ${selector}`);
  return found.declarations;
}

const definedTokens = new Set(
  [...stripComments(tokensCss).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
);

// Family names from the token font stacks, plus the generic families.
const fontNames = [
  ...[...tokensCss.matchAll(/--font-[a-z]+:\s*([^;]+);/g)].flatMap((match) =>
    (match[1] ?? "").split(",").map((name) => name.trim().replace(/"/g, "")),
  ),
  "serif",
  "sans-serif",
  "monospace",
];

test("app_css_imports_tokens", () => {
  expect(stripComments(appCss)).toMatch(/@import\s+"@orasenda\/tokens\/tokens\.css";/);
});

test("main_imports_design_system_css", () => {
  expect(mainTsx).toMatch(/^import "@orasenda\/ui\/components\.css";$/m);
});

test("styles_css_has_no_hex_px_or_font_name", () => {
  expect(cssFiles.map(({ name }) => name)).toContain("app.css");
  for (const file of cssFiles) {
    const css = stripComments(file.css);
    expect(css, file.name).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css, file.name).not.toMatch(/\d(\.\d+)?px\b/i);
    for (const rule of parseRules(css)) {
      for (const value of rule.declarations.values()) {
        for (const name of fontNames) {
          expect(value.split(/[\s,]+/).map((part) => part.replace(/"/g, ""))).not.toContain(name);
        }
      }
    }
  }
});

test("styles_css_values_are_tokens_or_keywords", () => {
  for (const file of cssFiles) {
    for (const { selector, declarations } of parseRules(file.css)) {
      for (const [property, value] of declarations) {
        for (const part of value.split(/\s+/)) {
          const token = /^var\((--[a-z0-9-]+)\)$/.exec(part)?.[1];
          const where = `${file.name}: ${selector} { ${property}: ${value} }`;
          if (token) {
            expect(definedTokens, where).toContain(token);
          } else {
            // Only CSS keywords (`flex`, `baseline`, …) and zero are allowed besides tokens.
            expect(part, where).toMatch(/^([a-z]+(-[a-z]+)*|0)$/);
          }
        }
      }
    }
  }
});

test("brand_uses_heading_type_style", () => {
  const brand = rule(".app-brand");
  expect(brand.get("margin")).toBe("0");
  expect(brand.get("font-size")).toBe("var(--type-heading-font-size)");
  expect(brand.get("line-height")).toBe("var(--type-heading-line-height)");
  expect(brand.get("font-weight")).toBe("var(--type-heading-font-weight)");
});

test("page_title_uses_title_type_style", () => {
  const title = rule(".app-page-title");
  expect(title.get("font-size")).toBe("var(--type-title-font-size)");
  expect(title.get("line-height")).toBe("var(--type-title-line-height)");
  expect(title.get("font-weight")).toBe("var(--type-title-font-weight)");
});

test("info_line_uses_body_sm_in_ink_muted", () => {
  const info = rule(".app-info");
  expect(info.get("font-size")).toBe("var(--type-body-sm-font-size)");
  expect(info.get("line-height")).toBe("var(--type-body-sm-line-height)");
  expect(info.get("font-weight")).toBe("var(--type-body-sm-font-weight)");
  expect(info.get("color")).toBe("var(--ink-muted)");
});

// The finish line and "Timer unavailable.".
test("muted_line_uses_body_sm_in_ink_muted", () => {
  const muted = rule(".app-muted");
  expect(muted.get("margin")).toBe("0");
  expect(muted.get("font-size")).toBe("var(--type-body-sm-font-size)");
  expect(muted.get("line-height")).toBe("var(--type-body-sm-line-height)");
  expect(muted.get("font-weight")).toBe("var(--type-body-sm-font-weight)");
  expect(muted.get("color")).toBe("var(--ink-muted)");
});

// The ring and "Timer unavailable." share this box, so neither the first view nor a failure
// shifts the page.
test("ring_slot_reserves_the_ring_space", () => {
  const slot = rule(".today-ring");
  expect(slot.get("inline-size")).toBe("var(--timer-size)");
  expect(slot.get("min-block-size")).toBe("var(--timer-size)");
});

test("today_keeps_the_content_width", () => {
  expect(rule(".today").get("max-inline-size")).toBe("var(--content-width)");
});
