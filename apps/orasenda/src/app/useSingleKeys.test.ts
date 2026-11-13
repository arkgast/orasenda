import { renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useSingleKeys } from "./useSingleKeys";

afterEach(() => {
  document.body.innerHTML = "";
});

function press(target: Element, init: KeyboardEventInit): boolean {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

test("single_key_fires_on_body_and_heading_only", () => {
  const run = vi.fn();
  renderHook(() => useSingleKeys({ f: run }, true));
  document.body.innerHTML = '<h1 tabindex="-1">Today</h1><button>b</button><input />';
  press(document.body, { key: "f" });
  press(document.querySelector("h1") as Element, { key: "F" });
  expect(run).toHaveBeenCalledTimes(2);
  press(document.querySelector("button") as Element, { key: "f" });
  press(document.querySelector("input") as Element, { key: "f" });
  expect(run).toHaveBeenCalledTimes(2);
});

test("single_key_ignores_modifiers_repeat_and_an_open_menu", () => {
  const run = vi.fn();
  renderHook(() => useSingleKeys({ f: run }, true));
  press(document.body, { key: "f", metaKey: true });
  press(document.body, { key: "f", ctrlKey: true });
  press(document.body, { key: "f", altKey: true });
  press(document.body, { key: "f", shiftKey: true });
  press(document.body, { key: "f", repeat: true });
  document.body.innerHTML = '<div role="menu"></div>';
  press(document.body, { key: "f" });
  expect(run).not.toHaveBeenCalled();
});

test("single_key_space_is_prevented_and_off_does_nothing", () => {
  const run = vi.fn();
  const { rerender } = renderHook(({ on }) => useSingleKeys({ Space: run }, on), {
    initialProps: { on: true },
  });
  expect(press(document.body, { key: " " })).toBe(false);
  expect(run).toHaveBeenCalledTimes(1);
  rerender({ on: false });
  expect(press(document.body, { key: " " })).toBe(true);
  expect(run).toHaveBeenCalledTimes(1);
});
