import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const dir = resolve(import.meta.dirname, "src");

const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;
const literals = (source: string) => source.match(LITERAL) ?? [];

// ---- code-first guards (#187) ----
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { arbitraryValues, scan } from "../../tools/tailwind-strict.ts";

function tsFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(path).isDirectory()) return tsFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const here = (name: string) => resolve(import.meta.dirname, name);
const typed = tsFiles(dir).filter((f) => !/\.(test|test-d|d)\.tsx?$/.test(f));

/** Names of the sources (path to text) that call or import createElement. */
function createElementHits(sources: Record<string, string>): string[] {
  return Object.keys(sources).filter((name) => /createElement/.test(sources[name] as string));
}

/** The "!" and emoji problems in one source's copy: its string literals and its JSX text. */
function copyProblems(text: string): { exclamation: string[]; emoji: string[] } {
  // JSX text between tags counts as copy too; "!" in code (!x, !==) does not.
  const jsxText = [...text.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)].map(
    (m) => m[1] as string,
  );
  const copy = [...literals(text), ...jsxText];
  return {
    exclamation: copy.filter((s) => s.includes("!")),
    emoji: copy.filter((s) => /\p{Extended_Pictographic}/u.test(s)),
  };
}

const typedSources = Object.fromEntries(
  typed.map((f) => [f.replace(`${dir}/`, ""), readFileSync(f, "utf8")]),
);

test("guard_rejects_create_element", () => {
  const all = Object.fromEntries(
    tsFiles(dir).map((f) => [f.replace(`${dir}/`, ""), readFileSync(f, "utf8")]),
  );
  expect(createElementHits(all)).toEqual([]);
  // The scan bites on a seeded file.
  expect(
    createElementHits({
      "Seed.tsx": `import { createElement } from "react";\nexport const x = createElement("div");`,
      "Clean.tsx": "export const y = 1;",
    }),
  ).toEqual(["Seed.tsx"]);
});

test("source_copy_has_no_exclamation_mark_or_emoji", () => {
  for (const [name, text] of Object.entries(typedSources)) {
    expect(copyProblems(text), name).toEqual({ exclamation: [], emoji: [] });
  }
  // The scan bites on seeded copy, in a literal and in JSX text, and ignores "!" in code.
  expect(copyProblems("export const A = () => <p>Done!</p>;").exclamation).toEqual(["Done!"]);
  expect(copyProblems('export const b = "Nice 🎉";').emoji).toEqual(['"Nice 🎉"']);
  expect(copyProblems("const ok = !x && a !== b;")).toEqual({ exclamation: [], emoji: [] });
});

test("source_critical_only_in_dialog_destructive_and_button_critical", () => {
  const allowed = /(^|\/)(dialog|button)(\.specimen)?\.tsx$/;
  const hits = typed
    .filter((f) => !allowed.test(f))
    .filter((f) => /critical|destructive/i.test(readFileSync(f, "utf8")))
    .map((f) => f.replace(`${dir}/`, ""));
  // types.ts and index.ts name the Dialog prop and the Button variant; nothing else may.
  expect(hits.filter((f) => !/^(types|index)\.tsx?$/.test(f))).toEqual([]);
});

test("lint_rejects_arbitrary_tailwind_value", () => {
  const fixture = readFileSync(here("../../tools/fixtures/arbitrary.tsx"), "utf8");
  expect(arbitraryValues(fixture)).toEqual(["w-[13px]", "bg-(--x)", "hover:text-[#fff]"]);
  expect(
    arbitraryValues(`const a = "data-[state=open]:bg-focus p-4 arr[0] [&>svg]:size-4";`),
  ).toEqual([]);
  expect(arbitraryValues("const c = `size-[2px]`;")).toEqual(["size-[2px]"]);
  expect(scan([here("src"), here("../../apps/orasenda/src")])).toEqual([]);
});

// ---- legacy removal guards (#270) ----
import { existsSync } from "node:fs";

/** Files whose text holds a class string starting with os- (a legacy hand-written class). */
function osClassHits(sources: Record<string, string>): string[] {
  return Object.keys(sources).filter((name) =>
    /["'`\s.]os-[a-z]/.test((sources[name] as string).replace(/\/\*[\s\S]*?\*\//g, "")),
  );
}

test("no_legacy_files_and_no_os_classes", () => {
  expect(readdirSync(dir).filter((n) => /^legacy\./.test(n))).toEqual([]);
  expect(existsSync(resolve(dir, "legacy.js"))).toBe(false);
  const roots = [dir, here("../../apps/orasenda/src")];
  const all = roots.flatMap((root) => walk(root).map((f) => [f, readFileSync(f, "utf8")] as const));
  expect(osClassHits(Object.fromEntries(all.filter(([f]) => !/\.test\.tsx?$/.test(f))))).toEqual(
    [],
  );
  // The scan bites on seeded text.
  expect(
    osClassHits({ "a.tsx": '<p className="os-num">1</p>', "b.css": ".os-actions {}" }),
  ).toEqual(["a.tsx", "b.css"]);
  expect(osClassHits({ "c.tsx": '<p className="font-mono">/* os-num */</p>' })).toEqual([]);
});

function walk(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx|css|js)$/.test(name) ? [path] : [];
  });
}
