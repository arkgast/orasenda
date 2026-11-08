import { fireEvent, render, screen } from "@testing-library/react";
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

/** Moves the prompt to step 2 and picks Work. */
function pickWork(app: string): void {
  fireEvent.click(screen.getByRole("button", { name: `I need ${app} now` }));
  fireEvent.click(screen.getByRole("radio", { name: "Work" }));
  expect(screen.getByRole("radio", { name: "Work" })).toBeChecked();
}

test("intent_prompt_reopen_resets_to_step_one", () => {
  const props = { app: "Safari", onReturn: () => {}, onContinue: () => {} };
  const { rerender } = render(<ui.IntentPrompt open {...props} />);
  pickWork("Safari");

  rerender(<ui.IntentPrompt open={false} {...props} />);
  rerender(<ui.IntentPrompt open {...props} />);

  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.getByRole("button", { name: "Back to focus" })).toHaveFocus();
});

test("intent_prompt_app_change_while_open_resets_to_step_one", () => {
  const props = { onReturn: () => {}, onContinue: () => {} };
  const { rerender } = render(<ui.IntentPrompt open app="Safari" {...props} />);
  pickWork("Safari");

  rerender(<ui.IntentPrompt open app="Mail" {...props} />);

  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByRole("button", { name: "Continue to Mail" })).toBeNull();
  expect(screen.getByRole("button", { name: "I need Mail now" })).toBeInTheDocument();
});

test("intent_prompt_step_two_has_no_wait_button", () => {
  render(
    <ui.IntentPrompt
      open
      app="Safari"
      onReturn={() => {}}
      onWait={() => {}}
      onContinue={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /wait 10 minutes/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "I need Safari now" }));

  expect(screen.queryByText(/wait 10 minutes/i)).toBeNull();
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Continue to Safari",
    "Back to focus",
  ]);
});

test("exports_every_namespace_member", () => {
  const exported = Object.keys(ui)
    .filter((k) => typeof (ui as Record<string, unknown>)[k] === "function")
    .sort();
  expect(exported).toEqual(Object.keys(window.Orasenda).sort());
});
