import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import * as ui from "./index.ts";

test("exports_intent_prompt_and_button", () => {
  expect(typeof ui.IntentPrompt).toBe("function");
  expect(typeof ui.Button).toBe("function");
});

test("intent_prompt_renders_with_global_react", () => {
  expect(window.React).toBeDefined();
  render(<ui.IntentPrompt open app="Safari" onReturn={() => {}} onWait={() => {}} />);
  expect(screen.getByText(/wait 10 minutes/i)).toBeInTheDocument();
});

test("intent_prompt_without_on_wait_has_no_wait_button", () => {
  render(<ui.IntentPrompt open app="Safari" onReturn={() => {}} />);
  expect(screen.queryByText(/wait 10 minutes/i)).toBeNull();
  expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
});

test("exports_every_namespace_member", () => {
  const exported = Object.keys(ui)
    .filter((k) => typeof (ui as Record<string, unknown>)[k] === "function")
    .sort();
  expect(exported).toEqual(Object.keys(window.Orasenda).sort());
});
