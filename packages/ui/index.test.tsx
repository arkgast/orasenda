import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import * as ui from "./index.ts";

test("exports_intent_prompt_and_button", () => {
  expect(typeof ui.IntentPrompt).toBe("function");
  expect(typeof ui.Button).toBe("function");
  for (const name of ["PageFrame", "ScrollRegion", "SettingsIndex", "SettingsRow"] as const) {
    expect(typeof ui[name]).toBe("function");
    expect(name in window.Orasenda).toBe(true);
  }
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

test("page_frame_renders_h1_and_three_tracks", () => {
  const { container, rerender } = render(
    <ui.PageFrame title="Settings" status={<span>s</span>}>
      <p>body</p>
    </ui.PageFrame>,
  );
  const h1 = screen.getByRole("heading", { level: 1, name: "Settings" });
  expect(h1.tabIndex).toBe(-1);
  const root = container.firstElementChild as HTMLElement;
  expect(root).toHaveClass("os-page");
  expect(root.children).toHaveLength(3);
  expect(root.children[0]).toHaveClass("os-page-head");
  expect(root.children[0]).toContainElement(h1);
  expect(root.children[1]).toHaveTextContent("s");
  expect(root.children[2]).toHaveTextContent("body");

  rerender(<ui.PageFrame title="Settings" />);
  expect((container.firstElementChild as HTMLElement).children).toHaveLength(3);

  rerender(
    <ui.PageFrame
      title="Shutdown"
      variant="flow"
      step="Step 2 of 4"
      footer={<button type="button">Continue</button>}
    />,
  );
  const flow = container.firstElementChild as HTMLElement;
  expect(flow).toHaveClass("os-page-flow");
  expect(flow.children).toHaveLength(4);
  expect(flow.children[3]).toHaveTextContent("Continue");
  expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
});

function stubLayout(scrollHeight: number, clientHeight: number): () => void {
  const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
  return () => {
    if (sh) Object.defineProperty(HTMLElement.prototype, "scrollHeight", sh);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
    if (ch) Object.defineProperty(HTMLElement.prototype, "clientHeight", ch);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  };
}

test("scroll_region_is_labelled_region_with_hidden_more_below_row", () => {
  const restore = stubLayout(500, 100);
  try {
    const { container } = render(
      <ui.ScrollRegion label="Settings">
        <p>long</p>
      </ui.ScrollRegion>,
    );
    const region = screen.getByRole("region", { name: "Settings" });
    expect(region).toHaveClass("os-scroll");
    const more = container.querySelector(".os-scroll-more") as HTMLElement;
    expect(more).not.toBeNull();
    expect(more).toHaveAttribute("aria-hidden", "true");
    expect(more).toHaveTextContent("More below");
    expect(region.tabIndex).toBe(0);
  } finally {
    restore();
  }
});

test("scroll_region_with_focusable_child_is_not_a_tab_stop", () => {
  const { container } = render(
    <ui.ScrollRegion label="Settings">
      <button type="button">Go</button>
    </ui.ScrollRegion>,
  );
  expect(screen.getByRole("region", { name: "Settings" }).hasAttribute("tabindex")).toBe(false);
  expect(container.querySelector(".os-scroll-more")).toBeNull();
});

const SECTIONS = [
  { id: "general", name: "General", value: "Match system" },
  { id: "timer", name: "Timer", value: "Classic · 25 / 5" },
  { id: "notifications", name: "Notifications", value: "Off in macOS" },
  { id: "keyboard", name: "Keyboard", value: "Set", problem: { text: "Not saved" } },
  { id: "about", name: "About and data", value: "Version unavailable" },
];

test("settings_index_is_one_roving_tab_stop", () => {
  render(<ui.SettingsIndex sections={SECTIONS} current="timer" onJump={() => {}} />);
  const items = screen.getAllByRole("button");
  expect(items.filter((i) => i.tabIndex === 0)).toHaveLength(1);
  expect(items[1]?.tabIndex).toBe(0);
  items[1]?.focus();
  fireEvent.keyDown(items[1] as HTMLElement, { key: "ArrowDown" });
  expect(items[2]).toHaveFocus();
  expect(items.filter((i) => i.tabIndex === 0)).toEqual([items[2]]);
  fireEvent.keyDown(items[2] as HTMLElement, { key: "ArrowUp" });
  expect(items[1]).toHaveFocus();
  expect(screen.getByText("Not saved")).toBeInTheDocument();
  expect(screen.getByText("Version unavailable")).toBeInTheDocument();
});

test("settings_index_return_calls_on_jump_and_marks_current_location", () => {
  const onJump = vi.fn();
  render(<ui.SettingsIndex sections={SECTIONS} current="timer" onJump={onJump} />);
  const items = screen.getAllByRole("button");
  expect(items.filter((i) => i.getAttribute("aria-current") === "location")).toEqual([items[1]]);
  fireEvent.keyDown(items[3] as HTMLElement, { key: "Enter" });
  expect(onJump).toHaveBeenCalledTimes(1);
  expect(onJump).toHaveBeenCalledWith("keyboard");
  fireEvent.click(items[0] as HTMLElement);
  expect(onJump).toHaveBeenLastCalledWith("general");
});

test("settings_row_links_helper_and_status_by_describedby", () => {
  const onAction = vi.fn();
  const { container, rerender } = render(
    <ui.SettingsRow
      label="Notifications"
      helper="Orasenda only notifies you when a session ends."
      status="macOS has notifications off for Orasenda."
      actionLabel="Open System Settings"
      onAction={onAction}
    >
      <input type="checkbox" aria-label="Tell me" />
    </ui.SettingsRow>,
  );
  const group = screen.getByRole("group", { name: "Notifications" });
  expect(group).toHaveAccessibleDescription(
    "Orasenda only notifies you when a session ends. macOS has notifications off for Orasenda.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
  expect(onAction).toHaveBeenCalledTimes(1);

  rerender(
    <ui.SettingsRow
      label="Notifications"
      helper="Helper only."
      disabledReason="Read-only until you update Orasenda."
    >
      <input type="checkbox" aria-label="Tell me" />
    </ui.SettingsRow>,
  );
  const ids =
    (container.querySelector("[aria-describedby]") as HTMLElement).getAttribute(
      "aria-describedby",
    ) ?? "";
  for (const id of ids.split(" ")) expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
  expect(screen.getByText("Read-only until you update Orasenda.")).toBeVisible();
});

test("inline_notice_row_keeps_one_always_mounted_status_paragraph", () => {
  const onAction = vi.fn();
  const { container, rerender } = render(<ui.InlineNotice variant="row">{""}</ui.InlineNotice>);
  const live = screen.getByRole("status");
  expect(live.tagName).toBe("P");
  expect(live).toHaveAttribute("aria-live", "polite");
  expect(live).toBeEmptyDOMElement();
  expect(container.querySelectorAll("[role=status]")).toHaveLength(1);

  rerender(<ui.InlineNotice variant="row">Saved. Custom focus is now 50 minutes.</ui.InlineNotice>);
  expect(screen.getByRole("status")).toBe(live);
  expect(live).toHaveTextContent("Saved. Custom focus is now 50 minutes.");
  expect((container.firstElementChild as HTMLElement).getAttribute("role")).toBeNull();

  rerender(
    <ui.InlineNotice
      variant="row"
      tone="attention"
      actionLabel="Try again"
      actionName="Try again saving"
      onAction={onAction}
    >
      Theme wasn't saved. Back to Match system.
    </ui.InlineNotice>,
  );
  expect(live.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again saving" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(live.contains(screen.getByRole("button"))).toBe(false);
});

test("input_unit_renders_suffix_after_number_field", () => {
  const { container, rerender } = render(
    <ui.Input label="Focus minutes" type="number" unit="min" />,
  );
  const input = screen.getByRole("spinbutton", { name: "Focus minutes" });
  expect(input.hasAttribute("unit")).toBe(false);
  const suffix = screen.getByText("min");
  expect(input.compareDocumentPosition(suffix) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector(".os-unit")).not.toBeNull();
  rerender(<ui.Input label="Focus minutes" type="number" />);
  expect(container.querySelector(".os-unit")).toBeNull();
});

test("empty_state_inline_has_one_line_and_no_action", () => {
  const text =
    "Nothing is recorded yet. Choosing which apps count as focus or distraction comes in a later update.";
  const { container } = render(<ui.EmptyState variant="inline" message={text} />);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  const paras = container.querySelectorAll("p");
  expect(paras).toHaveLength(1);
  expect(paras[0]).toHaveTextContent(text);
});

test("settings_index_wraps_and_resets_tab_stop_when_current_changes", () => {
  const { rerender } = render(
    <ui.SettingsIndex sections={SECTIONS} current="timer" onJump={() => {}} />,
  );
  const items = screen.getAllByRole("button");
  items[4]?.focus();
  fireEvent.keyDown(items[4] as HTMLElement, { key: "ArrowDown" });
  expect(items[0]).toHaveFocus();
  fireEvent.keyDown(items[0] as HTMLElement, { key: "ArrowUp" });
  expect(items[4]).toHaveFocus();
  expect(items.filter((i) => i.tabIndex === 0)).toEqual([items[4]]);
  rerender(<ui.SettingsIndex sections={SECTIONS} current="general" onJump={() => {}} />);
  expect(items.filter((i) => i.tabIndex === 0)).toEqual([items[0]]);
});

const FIELD_ERROR = "Between 5 and 180 minutes. Still using 45.";

function errorParagraph(control: HTMLElement): HTMLElement {
  const ids = (control.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  const err = ids
    .map((id) => document.getElementById(id))
    .find((n) => n?.id.endsWith("-error"));
  if (!err) throw new Error("no error paragraph in aria-describedby");
  return err;
}

test("input_error_uses_alert_glyph_not_mode_shape", () => {
  render(<ui.Input label="Focus minutes" error={FIELD_ERROR} />);
  const err = errorParagraph(screen.getByLabelText("Focus minutes"));
  expect(err.querySelector("svg.os-glyph")).not.toBeNull();
  expect(err.querySelector(".os-shape")).toBeNull();
});

test("field_error_is_described_not_live", () => {
  const cases = [
    { name: "Input", node: <ui.Input label="Focus minutes" error={FIELD_ERROR} />, label: "Focus minutes" },
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
    expect(err.querySelector("svg.os-glyph")).not.toBeNull();
    expect(err.querySelector(".os-shape")).toBeNull();
    unmount();
  }
});

test("inline_notice_default_action_uses_action_name", () => {
  render(
    <ui.InlineNotice actionLabel="Try again" actionName="Try again saving" onAction={() => {}}>
      Nope
    </ui.InlineNotice>,
  );
  expect(screen.getByRole("button", { name: "Try again saving" })).toBeInTheDocument();
});

test("scroll_region_remeasures_when_content_grows", async () => {
  let h = 50;
  const sh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => h,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 100,
  });
  try {
    const { container } = render(
      <ui.ScrollRegion label="Settings">
        <div id="grow">short</div>
      </ui.ScrollRegion>,
    );
    expect(container.querySelector(".os-scroll-more")).toBeNull();
    h = 500;
    (container.querySelector("#grow") as HTMLElement).appendChild(document.createElement("p"));
    await vi.waitFor(() => expect(container.querySelector(".os-scroll-more")).not.toBeNull());
  } finally {
    if (sh) Object.defineProperty(HTMLElement.prototype, "scrollHeight", sh);
    if (ch) Object.defineProperty(HTMLElement.prototype, "clientHeight", ch);
  }
});

test("settings_row_id_fixes_generated_ids", () => {
  const { container } = render(
    <ui.SettingsRow
      id="notif"
      label="Notifications"
      helper="Helper."
      status="Status."
      disabledReason="Why."
    >
      <input type="checkbox" aria-label="Tell me" />
    </ui.SettingsRow>,
  );
  for (const part of ["label", "help", "status", "why"]) {
    expect(container.querySelector(`[id="notif-${part}"]`)).not.toBeNull();
  }
  expect(screen.getByRole("group", { name: "Notifications" })).toHaveAttribute(
    "aria-describedby",
    "notif-help notif-status notif-why",
  );
});

test("inline_notice_row_action_variant_defaults_ghost_and_accepts_quiet", () => {
  const { rerender } = render(
    <ui.InlineNotice variant="row" actionLabel="Show" onAction={() => {}}>
      Saved.
    </ui.InlineNotice>,
  );
  const ghost = screen.getByRole("button", { name: "Show" }).className;
  rerender(
    <ui.InlineNotice variant="row" actionVariant="quiet" actionLabel="Show" onAction={() => {}}>
      Saved.
    </ui.InlineNotice>,
  );
  expect(screen.getByRole("button", { name: "Show" }).className).not.toBe(ghost);
  expect(ghost).toContain("ghost");
  const quiet = screen.getByRole("button", { name: "Show" }).className;
  expect(quiet).toContain("quiet");
  expect(quiet).not.toContain("ghost");
});
