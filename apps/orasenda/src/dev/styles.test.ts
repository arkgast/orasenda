import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Same rules and checks as src/styles.test.ts, for the spike's own style sheets. Read as text:
// Vitest replaces CSS imports with an empty string.
const tokensCss = readFileSync(
  createRequire(import.meta.filename).resolve("@orasenda/tokens/tokens.css"),
  "utf8",
);
const sheets = {
  "dev.css": readFileSync(join(import.meta.dirname, "dev.css"), "utf8"),
  "overlay.css": readFileSync(join(import.meta.dirname, "overlay.css"), "utf8"),
  "spike.css": readFileSync(join(import.meta.dirname, "spike.css"), "utf8"),
};

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

function rule(css: string, selector: string): Map<string, string> {
  const found = parseRules(css).find((candidate) => candidate.selector === selector);
  if (!found) throw new Error(`no rule for ${selector}`);
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

describe.each(Object.entries(sheets))("%s", (_name, css) => {
  test("spike_css_imports_tokens", () => {
    expect(stripComments(css)).toMatch(/@import\s+"@orasenda\/tokens\/tokens\.css";/);
  });

  test("spike_css_has_no_hex_px_or_font_name", () => {
    const stripped = stripComments(css);
    expect(stripped).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(stripped).not.toMatch(/\d(\.\d+)?px\b/i);
    for (const { declarations } of parseRules(stripped)) {
      for (const value of declarations.values()) {
        for (const name of fontNames) {
          expect(value.split(/[\s,]+/).map((part) => part.replace(/"/g, ""))).not.toContain(name);
        }
      }
    }
  });

  test("spike_css_values_are_tokens_or_keywords", () => {
    for (const { selector, declarations } of parseRules(css)) {
      for (const [property, value] of declarations) {
        for (const part of value.split(/\s+/)) {
          const token = /^var\((--[a-z0-9-]+)\)$/.exec(part)?.[1];
          const where = `${selector} { ${property}: ${value} }`;
          if (token) {
            expect(definedTokens, where).toContain(token);
          } else {
            // Only CSS keywords (`flex`, `baseline`, …) and zero are allowed besides tokens.
            expect(part, where).toMatch(/^([a-z]+(-[a-z]+)*|0)$/);
          }
        }
      }
    }
  });
});

test("overlay_page_is_opaque_surface", () => {
  expect(rule(sheets["overlay.css"], "body").get("background")).toBe("var(--surface)");
});

test("usage_list_uses_tabular_digits", () => {
  expect(rule(sheets["spike.css"], ".spike-usage").get("font-variant-numeric")).toBe(
    "tabular-nums",
  );
});

test("dev_page_is_opaque_surface_with_ink", () => {
  const body = rule(sheets["dev.css"], "body");
  expect(body.get("background")).toBe("var(--surface)");
  expect(body.get("color")).toBe("var(--ink)");
  expect(body.get("margin")).toBe("0");
});
