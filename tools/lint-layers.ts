// Layer lint check: lints each apps/orasenda/lint-fixtures/*.ts as if it lived at the virtual path
// named in its "// virtual:" header (relative to apps/orasenda/src/) and checks its "// expect:" header.
// "report" means Biome must report noRestrictedImports; "clean" means it must not.
// Biome 2.6.6 `lint --stdin-file-path` never prints diagnostics (it only returns fixed code), so each
// fixture is copied to its virtual path in a scratch tree that holds only biome.json, and linted by path.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export const fixtureDir = join(root, "apps/orasenda/lint-fixtures");

export function fixtures(): string[] {
  return readdirSync(fixtureDir)
    .filter((f) => f.endsWith(".ts"))
    .sort();
}

/** Returns an error message for one fixture, or null when Biome behaved as its headers say. */
export function checkFixture(name: string): string | null {
  const fx = join(fixtureDir, name);
  const text = readFileSync(fx, "utf8");
  const virtual = /^\/\/ virtual: (.*)$/m.exec(text)?.[1];
  const expectation = /^\/\/ expect: (.*)$/m.exec(text)?.[1];
  if (!virtual || (expectation !== "report" && expectation !== "clean")) {
    return `${name} needs '// virtual: <path>' and '// expect: report|clean' headers`;
  }
  const scratch = mkdtempSync(join(tmpdir(), "lint-layers-"));
  try {
    copyFileSync(join(root, "biome.json"), join(scratch, "biome.json"));
    const target = `apps/orasenda/src/${virtual}`;
    mkdirSync(join(scratch, dirname(target)), { recursive: true });
    copyFileSync(fx, join(scratch, target));
    const r = spawnSync(
      join(root, "node_modules/.bin/biome"),
      ["lint", "--vcs-enabled=false", "--colors=off", target],
      { cwd: scratch, encoding: "utf8" },
    );
    const out = `${r.stdout}${r.stderr}`;
    // Biome must really have linted the file: status 1 for a report, 0 and "Checked 1 file" for clean.
    if (expectation === "report" && r.status !== 1) {
      return `${name}: Biome exited ${r.status}, expected 1 (not linted?)\n${out}`;
    }
    if (expectation === "clean" && (r.status !== 0 || !out.includes("Checked 1 file"))) {
      return `${name}: Biome exited ${r.status} without checking 1 file\n${out}`;
    }
    const reported = out.includes("noRestrictedImports");
    if (expectation === "report" && !reported) return `${name} was not reported at ${virtual}`;
    if (expectation === "clean" && reported) {
      return `${name} was reported at ${virtual} but should be clean`;
    }
    return null;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const names = fixtures();
  if (names.length === 0) {
    console.log(`lint-layers: no fixtures found in ${fixtureDir}`);
    process.exit(1);
  }
  let failures = 0;
  for (const name of names) {
    const problem = checkFixture(name);
    if (problem) {
      console.log(`lint-layers: ${problem}`);
      failures++;
    } else {
      console.log(`ok   ${name}`);
    }
  }
  if (failures > 0) {
    console.log(`lint-layers: ${failures} problem(s)`);
    process.exit(1);
  }
  console.log("lint-layers: ok");
}
