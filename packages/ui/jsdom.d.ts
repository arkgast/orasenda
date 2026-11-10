// The slice of jsdom the design-system test uses (jsdom ships no types of its own).
declare module "jsdom" {
  export class JSDOM {
    constructor(
      html?: string,
      options?: { runScripts?: "dangerously"; pretendToBeVisual?: boolean },
    );
    readonly window: Window & typeof globalThis;
  }
}
