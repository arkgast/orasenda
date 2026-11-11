import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { useWindowLayout } from "./useWindowLayout";

function resize(width: number, height: number) {
  Object.assign(window, { innerWidth: width, innerHeight: height });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  document.documentElement.style.setProperty("--layout-compact-width", "640px");
  document.documentElement.style.setProperty("--layout-compact-height", "480px");
  resize(1024, 768);
});

test("compact_below_640_wide", () => {
  resize(639, 700);
  const { result } = renderHook(() => useWindowLayout());
  expect(result.current.compact).toBe(true);
  act(() => resize(640, 700));
  expect(result.current.compact).toBe(false);
});

test("compact_below_480_high", () => {
  resize(900, 479);
  const { result } = renderHook(() => useWindowLayout());
  expect(result.current.compact).toBe(true);
  act(() => resize(900, 480));
  expect(result.current.compact).toBe(false);
  expect(result.current).toMatchObject({ width: 900, height: 480 });
});

test("thresholds_come_from_the_css_variables", () => {
  document.documentElement.style.setProperty("--layout-compact-width", "700px");
  resize(680, 700);
  const { result } = renderHook(() => useWindowLayout());
  expect(result.current.compact).toBe(true);
});

test("timer_layout_follows_the_size", () => {
  resize(360, 240);
  const { result } = renderHook(() => useWindowLayout());
  expect(result.current.timer).toBe("stackedStrip");
  act(() => resize(800, 300));
  expect(result.current.timer).toBe("strip");
  act(() => resize(900, 600));
  expect(result.current.timer).toBe("ring");
});

test("a_missing_variable_is_an_error", () => {
  document.documentElement.style.removeProperty("--layout-compact-width");
  expect(() => renderHook(() => useWindowLayout())).toThrow(/layout-compact-width/);
});
