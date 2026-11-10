// The library build with one migrated export seeded: the first Cn task to move a component must not
// have to fix the declaration build (rolldown-plugin-dts cannot read the legacy value re-exports).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { afterAll, expect, test } from "vitest";
import { composeDeclarations, generate, withoutLegacyLines } from "./design-system/build.ts";
import { hasMigratedExports, libraryConfig } from "./vite.config.ts";

const seedDir = resolve(import.meta.dirname, ".build", "seed");
const scratch = mkdtempSync(join(tmpdir(), "ui-lib-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The seeded name: the first export still on legacy.js, so the test survives each component's migration. */
const SEEDED =
  /^export \{ (\w+) \} from "\.\/legacy\.js";/m.exec(
    readFileSync(resolve(import.meta.dirname, "src/index.ts"), "utf8"),
  )?.[1] ?? "";

function seed(): string {
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(
    join(seedDir, `${SEEDED}.tsx`),
    `import type { ReactElement } from "react";\n\nexport function ${SEEDED}(props: { keys: string }): ReactElement {\n  return <kbd>{props.keys}</kbd>;\n}\n`,
  );
  const index = readFileSync(resolve(import.meta.dirname, "src/index.ts"), "utf8")
    .replaceAll('"./legacy.', '"../../src/legacy.')
    .replaceAll('"./components/', '"../../src/components/')
    .replaceAll('"./lib/', '"../../src/lib/')
    .replaceAll('"./types.ts"', '"../../src/types.ts"')
    .replace(
      `export { ${SEEDED} } from "../../src/legacy.js";`,
      `export { ${SEEDED} } from "./${SEEDED}.tsx";`,
    );
  const file = join(seedDir, "index.ts");
  writeFileSync(file, index);
  return file;
}

test("library_build_with_one_migrated_export_composes_declarations", async () => {
  const entry = seed();
  expect(hasMigratedExports(entry)).toBe(true);
  const outDir = join(scratch, "lib");
  await build({ ...libraryConfig(entry, outDir), configFile: false, logLevel: "silent" });
  const dts = composeDeclarations(outDir);
  expect(dts).toMatch(new RegExp(`export declare function ${SEEDED}\\(`));
  expect(dts).toMatch(/export declare function Kbd\(/);
  expect(SEEDED).not.toBe("");
  expect(dts).not.toMatch(/from ["']\.\.?\/.*legacy\.js["']/);
}, 120_000);

test("withoutLegacyLines_drops_legacy_imports_and_keeps_migrated_exports", () => {
  const built = [
    'import { Button, Dialog } from "./legacy.js";',
    "export type * from './legacy.js';",
    'export type * from "./types.ts";',
    "export declare function Kbd(): void;",
    "export { Button, Dialog, Kbd };",
  ].join("\n");
  const out = withoutLegacyLines(built);
  expect(out).not.toMatch(/legacy|types\.ts/);
  expect(out).toContain("export { Kbd };");
});

test("design_system_build_refuses_a_folder_it_did_not_make", async () => {
  const folder = join(scratch, "not-mine");
  mkdirSync(folder);
  writeFileSync(join(folder, "keep.txt"), "mine");
  await expect(generate(folder)).rejects.toThrow(/not empty/);
  expect(readFileSync(join(folder, "keep.txt"), "utf8")).toBe("mine");
});
