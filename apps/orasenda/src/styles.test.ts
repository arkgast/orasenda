import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test } from "vitest";

// Read as text: Vitest replaces CSS imports (even `?raw`) with an empty string. Paths, not
// `URL`s: jsdom's global `URL` is not one `node:fs` accepts.
const appCss = readFileSync(join(import.meta.dirname, "styles", "app.css"), "utf8");
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

test("app_css_has_no_hex_px_or_font_name", () => {
  const css = stripComments(appCss);
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  expect(css).not.toMatch(/\d(\.\d+)?px\b/i);
  for (const rule of parseRules(css)) {
    for (const value of rule.declarations.values()) {
      for (const name of fontNames) {
        expect(value.split(/[\s,]+/).map((part) => part.replace(/"/g, ""))).not.toContain(name);
      }
    }
  }
});

test("app_css_values_are_tokens_or_keywords", () => {
  for (const { selector, declarations } of parseRules(appCss)) {
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

test("heading_uses_heading_type_style", () => {
  const title = rule(".app-title");
  expect(title.get("font-size")).toBe("var(--type-heading-font-size)");
  expect(title.get("line-height")).toBe("var(--type-heading-line-height)");
  expect(title.get("font-weight")).toBe("var(--type-heading-font-weight)");
});

test("info_line_uses_body_sm_in_ink_muted", () => {
  const info = rule(".app-info");
  expect(info.get("font-size")).toBe("var(--type-body-sm-font-size)");
  expect(info.get("line-height")).toBe("var(--type-body-sm-line-height)");
  expect(info.get("font-weight")).toBe("var(--type-body-sm-font-weight)");
  expect(info.get("color")).toBe("var(--ink-muted)");
});

test("clock_uses_mono_timer_md_tabular_digits", () => {
  const clock = rule(".app-clock");
  expect(clock.get("font-family")).toBe("var(--font-mono)");
  expect(clock.get("font-size")).toBe("var(--type-timer-md-font-size)");
  expect(clock.get("line-height")).toBe("var(--type-timer-md-line-height)");
  expect(clock.get("font-weight")).toBe("var(--type-timer-md-font-weight)");
  expect(clock.get("letter-spacing")).toBe("var(--type-timer-md-letter-spacing)");
  expect(clock.get("font-variant-numeric")).toBe("var(--type-timer-md-font-variant-numeric)");
});

// The clock and "clock unavailable" share this box: an empty clock keeps its line, and as a block
// it spans the row, so neither the first tick nor a failure shifts anything.
test("clock_slot_reserves_the_clock_space", () => {
  const slot = rule(".app-clock-slot");
  expect(slot.get("display")).toBe("block");
  expect(slot.get("min-block-size")).toBe("var(--type-timer-md-line-height)");
  expect(slot.get("margin-block-start")).toBe("var(--space-4)");
});
