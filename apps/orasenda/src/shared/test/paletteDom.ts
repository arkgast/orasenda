/** jsdom has neither; cmdk observes its list and scrolls the highlighted row into view. */
export function stubPaletteDom(): void {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
