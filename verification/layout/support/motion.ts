import type { Page } from "@playwright/test";

/** Elements with a non-zero transition duration or a running animation. */
export async function animatedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seconds = (list: string) =>
      list.split(",").map((v) => Number.parseFloat(v) * (v.trim().endsWith("ms") ? 0.001 : 1));
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      const timed = seconds(cs.transitionDuration).some((s) => s > 0);
      const animated =
        cs.animationName !== "none" && seconds(cs.animationDuration).some((s) => s > 0);
      if (timed || animated)
        out.push(
          `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className.baseVal ?? el.className).split(" ")[0]}` : ""}`,
        );
    }
    return out;
  });
}
