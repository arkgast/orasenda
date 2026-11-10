import { expect, test } from "@playwright/test";

test("playwright_launches_webkit", async ({ browser }) => {
  console.log(`webkit ${browser.version()}`);
  expect(browser.browserType().name()).toBe("webkit");
});
