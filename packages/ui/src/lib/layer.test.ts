import { afterEach, expect, test } from "vitest";
import { isTopmostLayer, layerContainer } from "./layer";

afterEach(() => {
  document.body.innerHTML = "";
});

const radix = (state: string, id: string) =>
  `<div id="${id}" role="dialog" data-slot="dialog-content" data-state="${state}"></div>`;
const byId = (id: string) => document.getElementById(id) as HTMLElement;

test("layer_container_is_body_without_a_layer", () => {
  expect(layerContainer()).toBe(document.body);
});

test("layer_container_is_the_open_radix_dialog_content", () => {
  document.body.innerHTML = radix("closed", "a") + radix("open", "b");
  expect(layerContainer()).toBe(byId("b"));
});

test("layer_container_is_the_nearest_native_open_dialog_of_the_anchor", () => {
  document.body.innerHTML = '<dialog open id="n"><button id="x">Go</button></dialog>';
  expect(layerContainer(byId("x"))).toBe(byId("n"));
  expect(layerContainer()).toBe(byId("n"));
});

test("layer_container_prefers_the_radix_content_over_a_native_dialog", () => {
  document.body.innerHTML = `<dialog open id="n"></dialog>${radix("open", "b")}`;
  expect(layerContainer()).toBe(byId("b"));
});

test("is_topmost_layer_only_for_the_last_open_layer", () => {
  document.body.innerHTML = radix("open", "a") + radix("open", "b");
  expect(isTopmostLayer(byId("b"))).toBe(true);
  expect(isTopmostLayer(byId("a"))).toBe(false);
});

test("is_topmost_layer_false_while_a_popup_is_open_inside", () => {
  document.body.innerHTML = radix("open", "a");
  const layer = byId("a");
  layer.innerHTML = '<div class="os-popover os-popover-panel"></div>';
  expect(isTopmostLayer(layer)).toBe(false);
  layer.innerHTML = "";
  expect(isTopmostLayer(layer)).toBe(true);
});
