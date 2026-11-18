// Decides whether a pull request changes only docs (docs/** or any *.md), so CI can skip the heavy checks.
// Fails closed: anything but a non-empty diff on a pull_request is false (run everything).
// CI mode appends docs_only=true|false to $GITHUB_OUTPUT. Reads GITHUB_EVENT_NAME and CI_BASE_REF.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

/** True when the list is non-empty and every path is under docs/ or ends in .md. */
export function classify(paths: string[]): boolean {
  return paths.length > 0 && paths.every((p) => p.startsWith("docs/") || p.endsWith(".md"));
}

/** The docs_only decision for the current environment, with the lines to print. */
export function decide(
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
): { docsOnly: boolean; log: string[] } {
  if (env.GITHUB_EVENT_NAME !== "pull_request") {
    return { docsOnly: false, log: ["Not a pull request: running every check."] };
  }
  const base = env.CI_BASE_REF;
  if (!base) return { docsOnly: false, log: ["CI_BASE_REF is not set: running every check."] };
  // --no-renames: a moved file lists its old path as a deletion, so code renamed into docs/ or to *.md still counts as code.
  // -z: paths are NUL-separated and never quoted, so unusual names are matched as they are.
  const r = spawnSync("git", ["diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const paths = r.status === 0 ? r.stdout.split("\0").filter((p) => p !== "") : [];
  if (r.status !== 0 || paths.length === 0) {
    return {
      docsOnly: false,
      log: ["No changed files found, or the diff failed: running every check."],
    };
  }
  return { docsOnly: classify(paths), log: ["Changed files:", ...paths] };
}

if (import.meta.main) {
  const { docsOnly, log } = decide(process.env);
  for (const line of log) console.log(line);
  console.log(`docs_only=${docsOnly}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
}
