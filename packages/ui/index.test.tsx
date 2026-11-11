import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import * as ui from "./src/index.ts";

test("exports_intent_prompt_and_button", () => {
  expect(typeof ui.IntentPrompt).toBe("function");
  expect(typeof ui.Button).toBe("function");
  for (const name of [
    "Choice",
    "ChoiceGroup",
    "ScrollRegion",
    "SettingsIndex",
    "SettingsRow",
  ] as const) {
    expect(typeof ui[name]).toBe("function");
  }
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
  const dts = readFileSync(resolve(import.meta.dirname, "src/types.ts"), "utf8");
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
    expect(err.querySelector("svg[fill=none]")).not.toBeNull();
    expect(err.querySelector("svg[fill=currentColor]")).toBeNull();
    unmount();
  }
});

test("exports_preset_popover", () => {
  expect(typeof ui.PopoverMenu).toBe("function");
});
