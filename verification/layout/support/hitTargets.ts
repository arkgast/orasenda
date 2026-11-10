import type { Locator } from "@playwright/test";

const FOCUSABLE =
  "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";

/** Focusables in scope smaller than min (default: the computed --hit-min in both dimensions). */
export async function smallTargets(
  scope: Locator,
  min?: { width: number; height: number },
): Promise<string[]> {
  return scope.evaluate(
    (root, args) => {
      let { width, height } = args.min ?? { width: 0, height: 0 };
      if (!args.min) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue("--hit-min").trim();
        const px = Number.parseFloat(raw);
        if (!Number.isFinite(px)) throw new Error(`--hit-min is "${raw}", not a pixel size`);
        width = height = px;
      }
      const out: string[] = [];
      for (const el of Array.from(root.querySelectorAll(args.selector))) {
        const r = el.getBoundingClientRect();
        if (r.width < width || r.height < height) {
          const name = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
          out.push(
            `${el.tagName.toLowerCase()} "${name}" is ${r.width}x${r.height}, needs ${width}x${height}`,
          );
        }
      }
      return out;
    },
    { min, selector: FOCUSABLE },
  );
}
