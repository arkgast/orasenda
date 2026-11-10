import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const dir = resolve(import.meta.dirname, "src");
const js = readFileSync(resolve(dir, "legacy.js"), "utf8");
const css = readFileSync(resolve(dir, "legacy.css"), "utf8");

const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;
const literals = (source: string) => source.match(LITERAL) ?? [];

// Operators such as !== and !p.x are code, so only string literals are scanned.
function withExclamation(source: string) {
  return literals(source).filter((s) => s.includes("!"));
}
function withEmoji(source: string) {
  return literals(source).filter((s) => /\p{Extended_Pictographic}/u.test(s));
}
// Lines of bundle.js that mention critical outside function Dialog, or inside it without p.destructive.
function criticalOutsideDialog(source: string) {
  const start = source.indexOf("function Dialog(");
  const end = source.indexOf("\nfunction ", start + 1);
  return source
    .split("\n")
    .map((line, i) => ({ line, at: source.split("\n").slice(0, i).join("\n").length }))
    .filter(({ line }) => /critical/i.test(line))
    .filter(({ line, at }) => !(at >= start && at < end && line.includes("p.destructive")))
    .map(({ line }) => line.trim());
}
// Selectors of every css rule that mentions critical but is not an .os-btn-critical rule.
function criticalRulesOutsideButton(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .filter((rule) => /critical/.test(rule))
    .flatMap((rule) => {
      const selector = rule.slice(0, rule.indexOf("{")).trim();
      const selectors = selector.split(",").map((s) => s.trim());
      return selectors.every((s) => /\.os-btn-critical\b/.test(s)) ? [] : [selector];
    });
}

test("bundle_copy_has_no_exclamation_mark", () => {
  expect(literals(js).length).toBeGreaterThan(500);
  expect(withExclamation(js)).toEqual([]);
  expect(withExclamation(`var a = !x; var b = "Done!";`)).toEqual(['"Done!"']);
});

test("bundle_copy_has_no_emoji", () => {
  expect(withEmoji(js)).toEqual([]);
  expect(withEmoji(`var a = "Saving…", b = "–", c = "⌘";`)).toEqual([]);
  expect(withEmoji(`var a = "Nice 🎉";`)).toEqual(['"Nice 🎉"']);
});

test("critical_used_only_by_destructive_dialog_and_critical_button", () => {
  expect(criticalOutsideDialog(js)).toEqual([]);
  expect(criticalRulesOutsideButton(css)).toEqual([]);
  expect(js).toContain('p.destructive ? "critical" : "primary"');
  expect(css).toMatch(/\.os-btn-critical/);
  // The checks bite: a chip that borrows the colour, or a stray use in a component, is found.
  expect(criticalRulesOutsideButton(`${css}\n.os-chip { color: var(--critical); }`)).toEqual([
    ".os-chip",
  ]);
  expect(criticalOutsideDialog(`${js}\n  var x = "critical";`)).toHaveLength(1);
});
