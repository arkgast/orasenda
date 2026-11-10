import type { Locator, Page } from "@playwright/test";

/** Opens /?c=<name>[&theme=...] and waits for the bundled fonts. Without a theme, the colour scheme decides. */
export async function openSpecimen(
  page: Page,
  name: string,
  opts: { theme?: "light" | "dark" } = {},
): Promise<void> {
  const query = new URLSearchParams({ c: name });
  if (opts.theme) query.set("theme", opts.theme);
  await page.goto(`/?${query}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Every frame on the page. */
export function frames(page: Page): Locator {
  return page.locator("[data-frame]");
}

/**
 * Moves focus to the next control with the keyboard. Playwright's WebKit on macOS follows Safari's
 * default, where plain Tab skips buttons and only Option+Tab reaches them; WKWebView in the app
 * does not have that setting, so the harness uses the key that reaches every control.
 */
export async function pressTab(page: Page): Promise<void> {
  await page.keyboard.press("Alt+Tab");
}
