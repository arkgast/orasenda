import type { Page } from "@playwright/test";

/** Starts recording every http(s) request the page makes; call the result for the URLs so far. */
export function recordRequests(page: Page): () => URL[] {
  const seen: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") seen.push(url);
  });
  return () => [...seen];
}
