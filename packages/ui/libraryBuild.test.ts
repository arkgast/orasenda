// The library build of the real index: one index.d.ts that carries the components and the types.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { afterAll, expect, test } from "vitest";
import { composeDeclarations, generate } from "./design-system/build.ts";
import { libraryConfig } from "./vite.config.ts";

const scratch = mkdtempSync(join(tmpdir(), "ui-lib-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

test("library_build_composes_declarations_with_components_and_types", async () => {
  const outDir = join(scratch, "lib");
  await build({
    ...libraryConfig(resolve(import.meta.dirname, "src/index.ts"), outDir),
    configFile: false,
    logLevel: "silent",
  });
  const dts = composeDeclarations(outDir);
  expect(dts).toMatch(/export declare function Kbd\(/);
  for (const name of ["Mode", "TimerMode", "FieldProps", "Command"]) {
    expect(dts).toMatch(new RegExp(`(interface|type) ${name}\\b`));
  }
  expect(dts).not.toMatch(/legacy/);
}, 120_000);

test("design_system_build_refuses_a_folder_it_did_not_make", async () => {
  const folder = join(scratch, "not-mine");
  mkdirSync(folder);
  writeFileSync(join(folder, "keep.txt"), "mine");
  await expect(generate(folder)).rejects.toThrow(/not empty/);
  expect(readFileSync(join(folder, "keep.txt"), "utf8")).toBe("mine");
});
