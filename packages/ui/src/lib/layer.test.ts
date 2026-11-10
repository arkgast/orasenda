import { afterEach, expect, test } from "vitest";
import { isTopmostLayer, layerContainer } from "./layer";

afterEach(() => {
  document.body.innerHTML = "";
});

function radixLayer(state = "open"): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "dialog");
  el.setAttribute("data-slot", "dialog-content");
  el.setAttribute("data-state", state);
  document.body.append(el);
  return el;
}

test("layer_container_is_body_without_a_layer", () => {
  expect(layerContainer()).toBe(document.body);
});

test("layer_container_is_the_open_radix_dialog_content", () => {
  radixLayer("closed");
  const open = radixLayer();
  expect(layerContainer()).toBe(open);
});

test("layer_container_is_the_nearest_native_open_dialog_of_the_anchor", () => {
  const native = document.createElement("dialog");
  native.setAttribute("open", "");
  const anchor = document.createElement("button");
  native.append(anchor);
  document.body.append(native);
  expect(layerContainer(anchor)).toBe(native);
  expect(layerContainer()).toBe(native);
});

test("layer_container_prefers_the_radix_content_over_a_native_dialog", () => {
  const native = document.createElement("dialog");
  native.setAttribute("open", "");
  document.body.append(native);
  const open = radixLayer();
  expect(layerContainer()).toBe(open);
});

test("is_topmost_layer_only_for_the_last_open_layer", () => {
  const first = radixLayer();
  const second = radixLayer();
  expect(isTopmostLayer(second)).toBe(true);
  expect(isTopmostLayer(first)).toBe(false);
});
