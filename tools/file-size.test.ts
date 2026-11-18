import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { fileSizeProblems } from "./file-size.ts";

let repo = "";
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "file-size-"));
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  lines("src/small.rs", 10);
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

function lines(path: string, count: number) {
  const file = join(repo, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "x\n".repeat(count));
}
function problems(): string[] {
  execFileSync("git", ["add", "-A"], { cwd: repo });
  return fileSizeProblems(repo);
}

test("clean tree passes", () => {
  expect(problems()).toEqual([]);
});

test("a file over 500 lines fails", () => {
  lines("src/big.rs", 501);
  const found = problems();
  expect(found).toHaveLength(1);
  expect(found[0]).toContain("src/big.rs");
});

test("exactly 500 lines passes", () => {
  lines("src/edge.ts", 500);
  expect(problems()).toEqual([]);
});

test("generated and archived paths are exempt", () => {
  for (const p of [
    "apps/orasenda/src/shared/ipc/bindings.ts",
    "packages/tokens/tokens.css",
    "packages/tokens/theme.css",
    "pkg/dist/a.js",
    "crates/x/gen/b.rs",
    "design/reviews/c.tsx",
  ]) {
    lines(p, 900);
  }
  expect(problems()).toEqual([]);
});

test("other file types are ignored", () => {
  lines("notes.md", 900);
  lines("data.json", 900);
  expect(problems()).toEqual([]);
});

test("paths with spaces are checked", () => {
  lines("src/with space.tsx", 501);
  expect(problems()[0]).toContain("with space.tsx");
});
