import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { classify, decide } from "./docs-only.ts";

test("docs only", () => {
  expect(classify(["docs/SPEC.md", "README.md", "a/b/c.md", "docs/x.json"])).toBe(true);
});
test("mixed", () => {
  expect(classify(["docs/SPEC.md", "src/a.ts"])).toBe(false);
});
test("empty", () => {
  expect(classify([])).toBe(false);
});
test("lookalikes", () => {
  expect(classify(["notmd", "docs.txt"])).toBe(false);
});
test("unusual names", () => {
  expect(classify(['docs/we ird "quoted" é.txt', "a\nb.md"])).toBe(true);
  expect(classify(['we ird "q".ts'])).toBe(false);
});
test("thousands of paths", () => {
  const docs = Array.from({ length: 3000 }, (_, i) => `docs/n${i}.md`);
  expect(classify(docs)).toBe(true);
  expect(classify(["crates/core/src/first.rs", ...docs])).toBe(false);
});

let repo = "";
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const pr = () => decide({ GITHUB_EVENT_NAME: "pull_request", CI_BASE_REF: "main" }, repo).docsOnly;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "docs-only-"));
  git("init", "-q", "-b", "main", ".");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  write("crates/core/src/foo.rs", "fn main() {}\n");
  write("crates/core/src/bar.rs", "code\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

test("code renamed into docs/ is code", () => {
  git("checkout", "-q", "-b", "rename-into-docs", "main");
  mkdirSync(join(repo, "docs"), { recursive: true });
  git("mv", "crates/core/src/foo.rs", "docs/foo.rs");
  git("commit", "-q", "-m", "mv");
  expect(pr()).toBe(false);
});
test("code renamed to .md is code", () => {
  git("checkout", "-q", "-b", "rename-to-md", "main");
  git("mv", "crates/core/src/bar.rs", "crates/core/src/bar.md");
  git("commit", "-q", "-m", "mv");
  expect(pr()).toBe(false);
});
test("docs added is docs only", () => {
  git("checkout", "-q", "-b", "docs-edit", "main");
  write("docs/new.md", "x\n");
  git("add", ".");
  git("commit", "-q", "-m", "docs");
  expect(pr()).toBe(true);
});
test("no changes fails closed", () => {
  git("checkout", "-q", "-b", "empty", "main");
  expect(pr()).toBe(false);
});
test("push event fails closed", () => {
  git("checkout", "-q", "docs-edit");
  expect(decide({ GITHUB_EVENT_NAME: "push", CI_BASE_REF: "main" }, repo).docsOnly).toBe(false);
});
test("failed diff fails closed", () => {
  expect(
    decide({ GITHUB_EVENT_NAME: "pull_request", CI_BASE_REF: "no-such-ref" }, repo).docsOnly,
  ).toBe(false);
});
