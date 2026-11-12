import type { Page } from "@playwright/test";

/** The app's dev server (playwright.config.ts): `layout.html` renders the real App against mockIPC. */
export const APP_URL = "http://localhost:4180";

/**
 * Opens `layout.html?scenario=<name>` at `size` and waits until the page has settled: the bundled
 * fonts are loaded and the page's own content is up (Today's action or notice, Settings' fields).
 * `opts.page: "settings"` opens Settings through the rail.
 */
export async function openApp(
  page: Page,
  scenario: string,
  size: { width: number; height: number },
  opts: { page?: string } = {},
): Promise<void> {
  await page.setViewportSize(size);
  const query = new URLSearchParams({ scenario });
  if (opts.page) query.set("page", opts.page);
  await page.goto(`${APP_URL}/layout.html?${query}`);
  if (opts.page === "settings") {
    await page.getByRole("radio", { name: /^Steady Focus/ }).waitFor();
  } else {
    await page
      .getByRole("button", { name: /Start focus|Starting|Pause|Resume/ })
      .or(page.getByText("Timer unavailable."))
      .first()
      .waitFor();
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
