import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

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
