import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The closed theme defines these font-size utilities (text-<name>). Without listing them, twMerge
// treats text-body and text-heading as text colours and drops them next to text-ink.
// The fluid spacing tokens are spacing values too, so px-3 must beat px-fluid-stack.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { spacing: ["fluid-gutter", "fluid-section", "fluid-stack"] },
    classGroups: {
      "font-size": [
        {
          text: [
            "timer-xl",
            "timer-lg",
            "timer-md",
            "timer-sm",
            "kbd",
            "display",
            "title",
            "heading",
            "body",
            "body-sm",
            "label",
            "caption",
            "body-alt",
          ],
        },
      ],
    },
  },
});

/** Joins class names and resolves Tailwind conflicts (the later utility wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
