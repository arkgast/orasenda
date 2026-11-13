import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// ADR-021: every file under src/ sits in a layer folder, in styles/ or in dev/.
const HOMES = ["surfaces", "app", "features", "domain", "shared", "styles", "dev"];
const srcDir = join(import.meta.dirname, "..", "..");

test("layers_every_file_has_a_home", () => {
  const files = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(srcDir.length + 1));
  expect(files.length).toBeGreaterThan(0);
  const homeless = files.filter((file) => !HOMES.includes(file.split("/")[0] ?? ""));
  expect(homeless).toEqual([]);
});

// Biome's layer overrides are depth-specific (biome.json). A file deeper than a
// covered depth would import upward unreported, so it fails here until an
// override is added for that depth.
const MAX_SEGMENTS: Record<string, number> = { app: 3, features: 4, domain: 3 };

test("layers_no_file_deeper_than_an_override", () => {
  const files = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(srcDir.length + 1));
  const tooDeep = files.filter((file) => {
    const parts = file.split("/");
    const max = MAX_SEGMENTS[parts[0] ?? ""];
    return max !== undefined && parts.length > max;
  });
  expect(tooDeep).toEqual([]);
});
