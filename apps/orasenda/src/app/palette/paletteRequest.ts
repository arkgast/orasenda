/** Pages "Commands…" asks the App to open the palette; the App listens while it is mounted. */
const listeners = new Set<() => void>();

export function requestPalette(): void {
  for (const listener of [...listeners]) listener();
}

/** Listens for requests; returns the function that stops listening. */
export function onPaletteRequest(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
