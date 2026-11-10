// Arbitrary Tailwind values (w-[13px], bg-(--x), text-[#fff]) bypass the tokens, so they are not allowed in
// app or library source. Biome's GritQL cannot match inside a string's words, so this scan runs in the lint step
// (`just tailwind-strict`). Only string and template literals in .ts and .tsx files are read.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "gen" || name === "fixtures")
      continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) yield path;
  }
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
  const hits = scan([join(root, "packages/ui/src"), join(root, "apps/orasenda/src")]);
  if (hits.length > 0) {
    console.error(
      `Arbitrary Tailwind values are not allowed; use a token or a utility:\n${hits.join("\n")}`,
    );
    process.exit(1);
  }
}
