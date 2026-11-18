// Size guard: a tracked source file is at most 500 lines, tests included.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const limit = 500;
const exemptFiles = new Set([
  "apps/orasenda/src/shared/ipc/bindings.ts",
  "packages/tokens/tokens.css",
  "packages/tokens/theme.css",
]);

function exempt(path: string): boolean {
  return (
    exemptFiles.has(path) ||
    path.startsWith("dist/") ||
    path.includes("/dist/") ||
    path.startsWith("gen/") ||
    path.includes("/gen/") ||
    path.startsWith("design/reviews/")
  );
}

function lineCount(file: string): number {
  let n = 0;
  for (const byte of readFileSync(file)) if (byte === 10) n++;
  return n;
}

/** Problems found in the git repo at `root`; empty when every tracked source file fits. */
export function fileSizeProblems(root: string): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--", "*.rs", "*.ts", "*.tsx", "*.js", "*.css"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const problems: string[] = [];
  for (const path of out.split("\0")) {
    if (path === "" || exempt(path)) continue;
    const file = join(root, path);
    try {
      if (!statSync(file).isFile()) continue;
    } catch {
      continue;
    }
    const n = lineCount(file);
    if (n > limit) problems.push(`${path} has ${n} lines (limit ${limit}); split it`);
  }
  return problems;
}

if (import.meta.main) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const problems = fileSizeProblems(root);
  for (const p of problems) console.log(`file-size: ${p}`);
  if (problems.length > 0) {
    console.log(`file-size: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("file-size: ok");
}
