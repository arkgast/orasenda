import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import * as ui from "./src/index.ts";

// jsdom lacks the dialog methods the legacy modal shell (IntentPrompt, wave 3) calls. Remove with that shell.
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

test("exports_intent_prompt_and_button", () => {
  expect(typeof ui.IntentPrompt).toBe("function");
  expect(typeof ui.Button).toBe("function");
  for (const name of ["ScrollRegion", "SettingsIndex", "SettingsRow"] as const) {
    expect(typeof ui[name]).toBe("function");
  }
});

test("intent_prompt_renders", () => {
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

test("exports_every_index_line", () => {
  const index = readFileSync(resolve(import.meta.dirname, "src/index.ts"), "utf8");
  const named = [...index.matchAll(/^export \{ (\w+) \} from /gm)].map((m) => m[1]);
  const exported = Object.keys(ui).sort();
  expect(exported).toEqual([...named].sort());
  expect(named).toEqual([...named].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
});

test("exports_small_controls_and_key_table", () => {
  for (const member of [ui.IconButton, ui.Tooltip, ui.Kbd, ui.describeShortcut]) {
    expect(typeof member).toBe("function");
  }
});

test("exports_timer_faces", () => {
  for (const member of [ui.TimerStrip, ui.timerLayout]) expect(typeof member).toBe("function");
  expect(ui.timerLayout.tokens).toBeDefined();
});

test("index_d_ts_has_no_timer_or_start_next_props", () => {
  const dts = readFileSync(resolve(import.meta.dirname, "src/legacy.d.ts"), "utf8");
  expect(dts).not.toContain("TimerRingNextProps");
  expect(dts).not.toContain("StartButtonNextProps");
  expect(dts).not.toContain("declare function TimerStrip");
  expect(dts).not.toContain("declare function timerLayout");
});

const FIELD_ERROR = "Between 5 and 180 minutes. Still using 45.";

function errorParagraph(control: HTMLElement): HTMLElement {
  const ids = (control.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  const err = ids.map((id) => document.getElementById(id)).find((n) => n?.id.endsWith("-error"));
  if (!err) throw new Error("no error paragraph in aria-describedby");
  return err;
}

test("field_error_is_described_not_live", () => {
  const cases = [
    { name: "TextArea", node: <ui.TextArea label="Notes" error={FIELD_ERROR} />, label: "Notes" },
  ];
  for (const c of cases) {
    const { container, unmount } = render(c.node);
    expect(screen.queryByRole("status"), c.name).toBeNull();
    expect(container.querySelectorAll("[role=status]"), c.name).toHaveLength(0);
    const control = screen.getByLabelText(c.label);
    expect(control).toHaveAttribute("aria-invalid", "true");
    const err = errorParagraph(control);
    expect(err.textContent).toBe(FIELD_ERROR);
    expect(err.hasAttribute("role"), c.name).toBe(false);
    expect(err.hasAttribute("aria-live"), c.name).toBe(false);
    expect(err.querySelector("svg.os-glyph")).not.toBeNull();
    expect(err.querySelector(".os-shape")).toBeNull();
    unmount();
  }
});

test("exports_preset_popover", () => {
  expect(typeof ui.PopoverMenu).toBe("function");
});

test("index_d_ts_declares_popover_menu", () => {
  const dts = readFileSync(resolve(import.meta.dirname, "src/legacy.d.ts"), "utf8");
  expect(dts).toContain("declare function PopoverMenu");
  expect(dts).toContain("PopoverMenu: typeof PopoverMenu");
  expect(dts).toContain("anchor: React.RefObject<HTMLElement | null>");
  expect(dts).toContain("singleKeys?: boolean");
  expect(dts).toContain("id?: string");
  expect(dts).not.toContain("PopoverMenuNextProps");
});
