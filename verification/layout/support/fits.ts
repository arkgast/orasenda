import { expect, type Locator } from "@playwright/test";

/** The frame and each descendant whose content is wider or taller than its box, named by data-state. */
export async function overflows(frame: Locator): Promise<string[]> {
  return frame.evaluate((root) => {
    const state = root.getAttribute("data-state") ?? "frame";
    const out: string[] = [];
    for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) {
        const cls =
          typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "";
        out.push(
          `${state}: ${el.tagName.toLowerCase()}${cls} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`,
        );
      }
    }
    return out;
  });
}

export async function expectFits(frame: Locator): Promise<void> {
  expect(await overflows(frame)).toEqual([]);
}
