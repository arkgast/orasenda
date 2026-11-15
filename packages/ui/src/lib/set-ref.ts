import type { Ref } from "react";

/** Point a ref (object or callback) at a node; a React 19 ref prop typed for the wider element. */
export function setRef<T extends HTMLElement>(
  ref: Ref<HTMLElement> | undefined,
  node: T | null,
): void {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}
