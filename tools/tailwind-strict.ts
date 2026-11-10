// Arbitrary Tailwind values (w-[13px], bg-(--x), text-[#fff]) bypass the tokens, so they are not allowed in
// app or library source. Biome's GritQL cannot match inside a string's words, so this scan runs in the lint step
// (`just tailwind-strict`). Only string and template literals in .ts and .tsx files are read.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
// Variant prefixes (hover:, data-[state=open]:, [&>svg]:) come off before the utility is judged.
const VARIANTS = /^(?:(?:[\w-]+-\[[^\]]*\]|\[[^\]]*\]|[\w-]+):)+/;
const ARBITRARY =
  /^!?-?(?:[a-z][\w-]*-(?:\[[^\]]+\]|\(--[^)]+\))(?:\/[\w.]+)?|\[[a-z-]+:[^\]="]+\])!?$/;

/** The class-like words in `source`'s string literals that carry an arbitrary value. */
export function arbitraryValues(source: string): string[] {
  const found: string[] = [];
  for (const literal of source.match(LITERAL) ?? []) {
    for (const word of literal.slice(1, -1).split(/\s+/)) {
      if (ARBITRARY.test(word.replace(VARIANTS, ""))) found.push(word);
    }
  }
  return found;
}

// Marker classes that emit no CSS by design: other selectors or the code look for them.
const MARKERS = new Set(["group", "peer", "dark", "light", "sr-only-focusable"]);
// Variants that carry a name (group/name, peer/name, group-hover/name) are still markers.
const MARKER_NAMED = /^(?:group|peer)\/[\w-]+$/;

const ui = resolve(import.meta.dirname, "../packages/ui");

type Compiler = { build(candidates: string[]): string };

// A bare @import: a package's own subpath, or its "style" export (tw-animate-css names only that).
function stylesheet(need: NodeJS.Require, id: string): string {
  try {
    return need.resolve(id);
  } catch {
    // Not every package exports package.json, so read it from the linked folder.
    const root = join(ui, "node_modules", id);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return resolve(root, pkg.exports?.["."]?.style ?? pkg.style);
  }
}

/** Tailwind's compiler over packages/ui/src/styles.css, with the real closed theme. */
export async function themeCompiler(): Promise<Compiler> {
  const need = createRequire(join(ui, "package.json"));
  const mod = await import(pathToFileURL(need.resolve("tailwindcss")).href);
  const compile = mod.compile ?? mod.default.compile;
  const sheet = join(ui, "src/styles.css");
  return await compile(readFileSync(sheet, "utf8"), {
    base: dirname(sheet),
    async loadStylesheet(id: string, base: string) {
      const path = id.startsWith(".") ? resolve(base, id) : stylesheet(need, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
}

/** Index just past the bracket that closes the one opened at `open`, skipping string literals. */
function closing(source: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}" };
  const stack = [pairs[source[open]]];
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      const sticky = new RegExp(LITERAL.source, "y");
      sticky.lastIndex = i;
      const m = sticky.exec(source);
      if (m) i += m[0].length - 1;
    } else if (c in pairs) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1] && stack.pop() !== undefined && stack.length === 0)
      return i + 1;
  }
  return source.length;
}

/** Class-name words in the string literals of className attributes and cn(), cva() and cx() calls. */
export function classWords(source: string): string[] {
  const words: string[] = [];
  const spans: string[] = [];
  const starts = /\bclassName\s*=\s*(?=["'{`])|\b(?:cn|cva|cx)\s*\(/g;
  for (let m = starts.exec(source); m; m = starts.exec(source)) {
    const at = m.index + m[0].length;
    if (m[0].endsWith("(")) spans.push(source.slice(at, closing(source, at - 1) - 1));
    else if (source[at] === "{") spans.push(source.slice(at + 1, closing(source, at) - 1));
    else spans.push(source.slice(at, at + (source.slice(at).match(LITERAL)?.[0].length ?? 0)));
  }
  for (const span of spans) {
    for (const found of span.matchAll(LITERAL)) {
      const literal = found[0];
      // `size === "lg"` compares a value; it is not a class name.
      if (/[!=]==?\s*$/.test(span.slice(0, found.index))) continue;
      // `${...}` holes are code, not class names.
      for (const word of literal
        .slice(1, -1)
        .replace(/\$\{[^}]*\}/g, " ")
        .split(/\s+/)) {
        if (word) words.push(word);
      }
    }
  }
  return [...new Set(words)];
}

const verdicts = new WeakMap<Compiler, { last: string; seen: Map<string, boolean> }>();

/** The class words in `source` that Tailwind compiles to no CSS against the real theme. */
export function noOpClasses(
  source: string,
  compiler: Compiler,
  own: ReadonlySet<string> = new Set(),
): string[] {
  // build() is cumulative: a class adds CSS only if it is a real utility, so compare with the last output.
  let state = verdicts.get(compiler);
  if (!state) verdicts.set(compiler, (state = { last: compiler.build([]), seen: new Map() }));
  const memo = state;
  const noop = (word: string) => {
    if (MARKERS.has(word) || own.has(word) || MARKER_NAMED.test(word)) return false;
    let verdict = memo.seen.get(word);
    if (verdict === undefined) {
      const css = compiler.build([word]);
      verdict = css === memo.last;
      memo.last = css;
      memo.seen.set(word, verdict);
    }
    return verdict;
  };
  return classWords(source).filter(noop);
}

/** Class names the project's own stylesheets define (legacy os-* and app-* classes): not Tailwind, so not judged. */
export function ownClasses(folders: readonly string[]): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === "gen") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".css") && name !== "styles.css") {
        const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(m[1]);
      }
    }
  };
  for (const folder of folders) walk(folder);
  return names;
}

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "gen" || name === "fixtures")
      continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) yield path;
  }
}

/** Every `file: word` that compiles to no CSS under the given folders. */
export function scanNoOp(folders: readonly string[], compiler: Compiler): string[] {
  const own = ownClasses(folders);
  return folders.flatMap((folder) =>
    [...sources(folder)]
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) =>
        noOpClasses(readFileSync(file, "utf8"), compiler, own).map(
          (word) => `${relative(process.cwd(), file)}: ${word}`,
        ),
      ),
  );
}

/** Every `file: word` under the given folders. */
export function scan(folders: readonly string[]): string[] {
  return folders.flatMap((folder) =>
    [...sources(folder)].flatMap((file) =>
      arbitraryValues(readFileSync(file, "utf8")).map(
        (word) => `${relative(process.cwd(), file)}: ${word}`,
      ),
    ),
  );
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, "..");
  const folders = [join(root, "packages/ui/src"), join(root, "apps/orasenda/src")];
  const hits = scan(folders);
  if (hits.length > 0) {
    console.error(
      `Arbitrary Tailwind values are not allowed; use a token or a utility:\n${hits.join("\n")}`,
    );
    process.exit(1);
  }
  const dead = scanNoOp(folders, await themeCompiler());
  if (dead.length > 0) {
    console.error(
      `These classes emit no CSS in the closed theme; use an existing utility:\n${dead.join("\n")}`,
    );
    process.exit(1);
  }
}
