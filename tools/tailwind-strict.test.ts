import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { classWords, noOpClasses, ownClasses, scanNoOp, themeCompiler } from "./tailwind-strict.ts";

const root = join(import.meta.dirname, "..");
const folders = [join(root, "packages/ui/src"), join(root, "apps/orasenda/src")];

test("lint_rejects_no_op_tailwind_class", async () => {
  const compiler = await themeCompiler();
  const fixture = readFileSync(join(import.meta.dirname, "fixtures/noop.tsx"), "utf8");
  assert.deepEqual(noOpClasses(fixture, compiler), ["font-bold", "m-9"]);
  // Real utilities, the zero step, markers and named markers pass.
  const ok = `const a = <p className="m-0 min-w-0 inset-0 group peer group/row text-body p-4" />;`;
  assert.deepEqual(noOpClasses(ok, compiler), []);
  // cva and cx literals are read; comparisons and non-class strings are not.
  const mixed = `const v = cva("font-semibold", { variants: { size: { lg: "m-9" } } });
    const c = cx(size === "lg" && "p-4", "top-0");`;
  assert.deepEqual(noOpClasses(mixed, compiler), ["font-semibold", "m-9"]);
  assert.deepEqual(classWords(`const x = "font-bold"; const y = 1;`), []);
  assert.deepEqual(scanNoOp(folders, compiler), []);
  // A real utility repeated in the same file is not a false positive (build() is cumulative).
  const repeat = `const a = <p className="p-4 p-4 m-0" />; const b = <p className="p-4 m-0" />;`;
  assert.deepEqual(noOpClasses(repeat, compiler), []);
});

test("own_classes_exempt_only_legacy_prefixes", () => {
  const dir = mkdtempSync(join(tmpdir(), "own-"));
  writeFileSync(
    join(dir, "x.css"),
    ".os-card{} .app-bar{} .settings-row{} .spike-a{} .font-bold{} .dark{} .today-ring{} .ring-x{}",
  );
  assert.deepEqual([...ownClasses([dir])].sort(), [
    "app-bar",
    "os-card",
    "settings-row",
    "spike-a",
    "today-ring",
  ]);
});
