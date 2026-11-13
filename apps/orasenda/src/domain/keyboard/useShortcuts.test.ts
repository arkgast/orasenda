import { fireEvent, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useShortcuts } from "./useShortcuts";

function bindings(run = vi.fn(), when = () => true) {
  return [{ key: "1", meta: true as const, when, run }];
}

test("cmd_digit_navigates", () => {
  const run = vi.fn();
  renderHook(() => useShortcuts(bindings(run)));
  const allowed = fireEvent.keyDown(document.body, { key: "1", metaKey: true });
  expect(run).toHaveBeenCalledTimes(1);
  expect(allowed).toBe(false);
});

test("cmd_digit_ignored_in_input", () => {
  const run = vi.fn();
  renderHook(() => useShortcuts(bindings(run)));
  const input = document.body.appendChild(document.createElement("input"));
  const allowed = fireEvent.keyDown(input, { key: "1", metaKey: true });
  expect(run).not.toHaveBeenCalled();
  expect(allowed).toBe(true);
  input.remove();
});

test("ignored_while_composing", () => {
  const run = vi.fn();
  renderHook(() => useShortcuts(bindings(run)));
  fireEvent.keyDown(document.body, { key: "1", metaKey: true, isComposing: true });
  expect(run).not.toHaveBeenCalled();
});

test("no_match_is_not_prevented", () => {
  renderHook(() => useShortcuts(bindings()));
  expect(fireEvent.keyDown(document.body, { key: "7", metaKey: true })).toBe(true);
  expect(fireEvent.keyDown(document.body, { key: "1" })).toBe(true);
  expect(fireEvent.keyDown(document.body, { key: "1", metaKey: true, shiftKey: true })).toBe(true);
});

test("when_false_is_not_prevented", () => {
  const run = vi.fn();
  renderHook(() => useShortcuts(bindings(run, () => false)));
  expect(fireEvent.keyDown(document.body, { key: "1", metaKey: true })).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

test("shift_binding_needs_shift", () => {
  const run = vi.fn();
  renderHook(() =>
    useShortcuts([{ key: "Enter", meta: true, shift: true, when: () => true, run }]),
  );
  fireEvent.keyDown(document.body, { key: "Enter", metaKey: true });
  expect(run).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: "Enter", metaKey: true, shiftKey: true });
  expect(run).toHaveBeenCalledTimes(1);
});

test("latest_bindings_run_and_removed_on_unmount", () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = renderHook(({ run }) => useShortcuts(bindings(run)), {
    initialProps: { run: first },
  });
  rerender({ run: second });
  fireEvent.keyDown(document.body, { key: "1", metaKey: true });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  unmount();
  fireEvent.keyDown(document.body, { key: "1", metaKey: true });
  expect(second).toHaveBeenCalledTimes(1);
});
