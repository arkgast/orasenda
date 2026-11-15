// The pure import-specifier helper, in the default run so the Windows step proves it before the build.
import { expect, test } from "vitest";
import { importSpecifier } from "./vite.config.ts";

test("importSpecifier_uses_forward_slashes", () => {
  expect(importSpecifier("D:\\a\\b\\c.ts")).toBe("D:/a/b/c.ts");
  expect(importSpecifier("/a/b/c.ts")).toBe("/a/b/c.ts");
});
