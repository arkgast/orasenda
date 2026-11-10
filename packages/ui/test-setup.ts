import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// describeShortcut throws on an unknown glyph string in tests (Kbd README, "Shortcut glyphs").
const host = window as unknown as { Orasenda?: Record<string, unknown> };
host.Orasenda = { ...host.Orasenda, strictShortcuts: true };

// jsdom lacks the dialog methods the design system's Dialog calls.
const proto = HTMLDialogElement.prototype;
if (typeof proto.showModal !== "function") {
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
if (typeof proto.close !== "function") {
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

afterEach(() => {
  cleanup();
});
