import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { IntentPrompt } from "./intent-prompt";

test("exports_intent_prompt", () => {
  expect(typeof IntentPrompt).toBe("function");
});

test("intent_prompt_renders", () => {
  render(<IntentPrompt open app="Safari" onReturn={() => {}} onWait={() => {}} />);
  expect(screen.getByText(/wait 10 minutes/i)).toBeInTheDocument();
});

test("exposes_dialog_with_name", () => {
  render(<IntentPrompt open app="Safari" onReturn={() => {}} />);
  expect(screen.getByRole("dialog", { name: "Is this what you intended?" })).toBeInTheDocument();
  expect(screen.getByText(/you opened safari during a focus session/i)).toBeInTheDocument();
});

test("intent_prompt_without_on_wait_has_no_wait_button", () => {
  render(<IntentPrompt open app="Safari" onReturn={() => {}} />);
  expect(screen.queryByText(/wait 10 minutes/i)).toBeNull();
  expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
});

test("renders_step_one_with_word_or_shape", () => {
  const { container } = render(
    <IntentPrompt open app="Safari" onReturn={() => {}} onWait={() => {}} onContinue={() => {}} />,
  );
  expect(screen.getByRole("button", { name: "Back to focus" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Wait 10 minutes, then decide" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "I need Safari now" })).toBeInTheDocument();
  expect(document.querySelector("[data-slot='intent-prompt-breath']")).not.toBeNull();
  expect(container.querySelector("dialog")).toBeNull();
});

/** Moves the prompt to step 2 and picks Work. */
function pickWork(app: string): void {
  fireEvent.click(screen.getByRole("button", { name: `I need ${app} now` }));
  fireEvent.click(screen.getByRole("radio", { name: "Work" }));
  expect(screen.getByRole("radio", { name: "Work" })).toBeChecked();
}

test("renders_step_two_with_word_or_shape", () => {
  const onContinue = vi.fn();
  render(<IntentPrompt open app="Safari" onReturn={() => {}} onContinue={onContinue} />);
  fireEvent.click(screen.getByRole("button", { name: "I need Safari now" }));
  expect(screen.getByRole("group", { name: "What do you need Safari for?" })).toBeInTheDocument();
  expect(screen.getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual([
    "Work",
    "Quick check",
    "Other",
  ]);
  const next = screen.getByRole("button", { name: "Continue to Safari" });
  expect(next).toHaveAttribute("aria-disabled", "true");
  expect(next).toHaveAccessibleDescription(
    "Pick one to continue. Your reason stays on this device.",
  );
  fireEvent.click(next);
  expect(onContinue).not.toHaveBeenCalled();
  expect(screen.getAllByRole("radio")[0]).toHaveFocus();

  fireEvent.click(screen.getByRole("radio", { name: "Quick check" }));
  expect(next).not.toHaveAttribute("aria-disabled");
  fireEvent.click(next);
  expect(onContinue).toHaveBeenCalledWith("Quick check");
});

test("intent_prompt_reopen_resets_to_step_one", () => {
  const props = { app: "Safari", onReturn: () => {}, onContinue: () => {} };
  const { rerender } = render(<IntentPrompt open {...props} />);
  pickWork("Safari");

  rerender(<IntentPrompt open={false} {...props} />);
  rerender(<IntentPrompt open {...props} />);

  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.getByRole("button", { name: "Back to focus" })).toHaveFocus();
});

test("intent_prompt_app_change_while_open_resets_to_step_one", () => {
  const props = { onReturn: () => {}, onContinue: () => {} };
  const { rerender } = render(<IntentPrompt open app="Safari" {...props} />);
  pickWork("Safari");

  rerender(<IntentPrompt open app="Mail" {...props} />);

  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByRole("button", { name: "Continue to Mail" })).toBeNull();
  expect(screen.getByRole("button", { name: "I need Mail now" })).toBeInTheDocument();
});

test("intent_prompt_step_two_has_no_wait_button", () => {
  render(
    <IntentPrompt open app="Safari" onReturn={() => {}} onWait={() => {}} onContinue={() => {}} />,
  );
  expect(screen.getByRole("button", { name: /wait 10 minutes/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "I need Safari now" }));

  expect(screen.queryByText(/wait 10 minutes/i)).toBeNull();
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Continue to Safari",
    "Back to focus",
  ]);
});

test("escape_and_back_call_on_return_in_both_steps", () => {
  const onReturn = vi.fn();
  render(<IntentPrompt open app="Safari" onReturn={onReturn} onContinue={() => {}} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onReturn).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "I need Safari now" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onReturn).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Back to focus" }));
  expect(onReturn).toHaveBeenCalledTimes(3);
});

test("backdrop_click_never_dismisses", () => {
  const onReturn = vi.fn();
  render(<IntentPrompt open app="Safari" onReturn={onReturn} />);
  const overlay = document.querySelector("[data-slot='dialog-overlay']") as HTMLElement;
  fireEvent.pointerDown(overlay);
  fireEvent.click(overlay);
  expect(onReturn).not.toHaveBeenCalled();
});
