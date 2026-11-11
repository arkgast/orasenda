import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { describeShortcut } from "../../lib/shortcuts";
import { IconButton } from "./icon-button";
import { PopoverMenu } from "./popover-menu";

// Radix Popper measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const PANEL = '[data-slot="popover-menu"]';

type Item = Parameters<typeof PopoverMenu>[0]["items"][number];

const PRESETS: Item[] = [
  { id: "classic", label: "Classic", meta: "25 / 5", kind: "radio", checked: true },
  { id: "deep", label: "Deep Block", meta: "90 / 15", kind: "radio" },
  { id: "short", label: "Short", meta: "15 / 3", kind: "radio" },
  { id: "custom", label: "Custom", meta: "50 / 10", kind: "radio" },
];
const SETTINGS: Item = { id: "settings", label: "Timer settings…", kind: "link" };
const WITH_SETTINGS = [...PRESETS, SETTINGS];

type HostProps = Partial<Parameters<typeof PopoverMenu>[0]> & {
  log: string[];
  startOpen?: boolean;
  keys?: string;
  /** A tabbable control placed after the trigger in DOM order. */
  after?: boolean;
  /** A second trigger with a Tooltip, to leave a tooltip showing elsewhere. */
  other?: boolean;
};

function Host({
  log,
  startOpen = true,
  keys,
  after,
  other,
  items = WITH_SETTINGS,
  heading = "Preset",
  ...rest
}: HostProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(startOpen);
  const id = "host-menu";
  return (
    <div>
      <span ref={anchor}>
        {keys ? (
          <button
            type="button"
            aria-label="Change preset"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            aria-keyshortcuts={keys}
            onClick={() => setOpen(!open)}
          />
        ) : (
          <IconButton
            label="Change preset"
            icon={<svg aria-hidden="true" />}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            onClick={() => setOpen(!open)}
          />
        )}
      </span>
      {after ? <button type="button">After</button> : null}
      {other ? <IconButton label="Elsewhere" icon={<svg aria-hidden="true" />} /> : null}
      {open ? (
        <PopoverMenu
          id={id}
          anchor={anchor}
          heading={heading}
          items={items}
          onSelect={(i) => log.push(i)}
          onClose={() => {
            log.push("close");
            setOpen(false);
          }}
          {...rest}
        />
      ) : null}
    </div>
  );
}

// Radix moves roving focus on the next task, so a key press is followed by one.
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const key = async (k: string, init: KeyboardEventInit = {}) => {
  fireEvent.keyDown(document.activeElement as Element, { key: k, ...init });
  await settle();
};
const rowName = (n: string) => {
  const row = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((r) =>
    r.textContent?.includes(n),
  );
  if (!row) throw new Error(`no menu row named ${n}`);
  return row;
};
const trigger = () => screen.getByRole("button", { name: "Change preset" });

test("popover_menu_host_trigger_expanded_and_controls_point_at_menu_id", async () => {
  const log: string[] = [];
  render(<Host log={log} startOpen={false} />);
  const attrs = () =>
    Object.fromEntries(
      [...trigger().attributes]
        .filter((a) => !a.name.startsWith("aria-"))
        .map((a) => [a.name, a.value]),
    );
  const before = attrs();
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(trigger());
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  const menu = document.getElementById(trigger().getAttribute("aria-controls") as string);
  expect(menu?.getAttribute("role")).toBe("menu");
  expect(menu).toBe(screen.getByRole("menu"));
  expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
  expect(trigger().hasAttribute("aria-keyshortcuts")).toBe(false);
  // The menu writes nothing of its own on the trigger: only the host's four aria attributes differ.
  expect(attrs()).toEqual(before);
  expect(
    [...trigger().attributes]
      .map((a) => a.name)
      .filter((n) => n.startsWith("aria-"))
      .sort(),
  ).toEqual(["aria-controls", "aria-expanded", "aria-haspopup", "aria-label"]);
  await key("Escape");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(trigger().hasAttribute("aria-controls")).toBe(false);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("popover_menu_single_keys_controls_p_shortcut", async () => {
  const log: string[] = [];
  const { rerender } = render(<Host log={log} singleKeys keys={describeShortcut("P").aria} />);
  const panel = () => document.querySelector(PANEL) as Element;
  const kbd = panel().querySelector('[data-slot="kbd"]');
  expect(kbd?.textContent).toBe("P");
  expect(kbd?.getAttribute("aria-hidden")).toBe("true");
  expect(trigger().getAttribute("aria-keyshortcuts")).toBe(describeShortcut("P").aria);
  await key("p");
  expect(log).toEqual([]);
  rerender(<Host log={log} />);
  expect(panel().querySelector('[data-slot="kbd"]')).toBeNull();
  expect(trigger().hasAttribute("aria-keyshortcuts")).toBe(false);
  rerender(<Host log={log} singleKeys={false} />);
  expect(panel().querySelector('[data-slot="kbd"]')).toBeNull();
  expect(within(panel() as HTMLElement).queryByText("P")).toBeNull();
});

test("popover_menu_id_settable", () => {
  const log: string[] = [];
  const anchor = { current: document.body };
  render(
    <PopoverMenu
      id="preset-menu"
      anchor={anchor}
      heading="Preset"
      description="Choosing one applies it."
      items={PRESETS}
      onSelect={() => {}}
      onClose={() => {}}
    />,
  );
  const menu = screen.getByRole("menu", { name: "Preset" });
  expect(menu.id).toBe("preset-menu");
  expect(menu.getAttribute("aria-labelledby")).toBe("preset-menu-heading");
  expect(menu.getAttribute("aria-describedby")).toBe("preset-menu-desc");
  expect(document.getElementById("preset-menu-heading")?.tagName).toBe("P");
  expect(document.getElementById("preset-menu-desc")?.textContent).toBe("Choosing one applies it.");
  expect(log).toEqual([]);
});

test("popover_menu_id_generated_when_omitted", () => {
  render(
    <PopoverMenu
      anchor={{ current: null }}
      heading="Preset"
      items={PRESETS}
      onSelect={() => {}}
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole("menu").id.length).toBeGreaterThan(0);
});

test("popover_menu_arrows_move_and_return_selects", async () => {
  const log: string[] = [];
  render(<Host log={log} />);
  expect(document.activeElement).toBe(rowName("Classic"));
  await key("ArrowDown");
  expect(document.activeElement).toBe(rowName("Deep Block"));
  expect(rowName("Deep Block").tabIndex).toBe(0);
  expect(rowName("Classic").tabIndex).toBe(-1);
  await key("ArrowUp");
  await key("ArrowUp");
  expect(document.activeElement).toBe(rowName("Timer settings"));
  await key("Home");
  expect(document.activeElement).toBe(rowName("Classic"));
  await key("End");
  expect(document.activeElement).toBe(rowName("Timer settings"));
  await key("Home");
  await key("ArrowDown");
  await key("Enter");
  expect(log).toEqual(["deep", "close"]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

test("popover_menu_space_chooses_checkbox", async () => {
  const log: string[] = [];
  const items: Item[] = [
    { id: "a", label: "First option", kind: "checkbox", checked: true },
    { id: "b", label: "Second option", kind: "checkbox" },
    { id: "c", label: "Unavailable option", kind: "checkbox", disabled: true },
  ];
  render(<Host log={log} items={items} />);
  expect(rowName("First option").getAttribute("role")).toBe("menuitemcheckbox");
  expect(rowName("First option").getAttribute("aria-checked")).toBe("true");
  expect(rowName("Second option").getAttribute("aria-checked")).toBe("false");
  await key("ArrowDown");
  await key(" ");
  expect(log).toEqual(["b", "close"]);
});

test("popover_menu_disabled_checkbox_is_focusable_and_never_chosen", async () => {
  const log: string[] = [];
  const items: Item[] = [
    { id: "a", label: "First option", kind: "checkbox" },
    { id: "c", label: "Unavailable option", kind: "checkbox", disabled: true },
  ];
  render(<Host log={log} items={items} />);
  await key("ArrowDown");
  expect(document.activeElement).toBe(rowName("Unavailable option"));
  expect(rowName("Unavailable option").getAttribute("aria-disabled")).toBe("true");
  await key(" ");
  expect(log).toEqual([]);
  expect(screen.getByRole("menu")).toBeTruthy();
});

test("popover_menu_esc_closes_and_returns_focus_to_trigger", async () => {
  const log: string[] = [];
  const { unmount } = render(<Host log={log} />);
  expect(document.activeElement).not.toBe(trigger());
  await key("Escape");
  expect(log).toEqual(["close"]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());
  unmount();

  const log2: string[] = [];
  render(<Host log={log2} />);
  await key("Tab", { shiftKey: true });
  expect(log2).toEqual(["close"]);
  expect(document.activeElement).toBe(trigger());
});

test("popover_menu_tab_closes_and_focuses_next_tabbable_after_trigger", async () => {
  const log: string[] = [];
  render(<Host log={log} after />);
  await key("Tab");
  expect(log).toEqual(["close"]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }));
});

test("popover_menu_tab_with_nothing_after_returns_to_trigger", async () => {
  const log: string[] = [];
  render(<Host log={log} />);
  await key("Tab");
  expect(log).toEqual(["close"]);
  expect(document.activeElement).toBe(trigger());
});

afterEach(() => {
  vi.useRealTimers();
});

test("popover_menu_one_esc_closes_menu_while_a_tooltip_shows_elsewhere", async () => {
  vi.useFakeTimers();
  document.documentElement.style.setProperty("--duration-quick", "160ms");
  const log: string[] = [];
  render(<Host log={log} other />);
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
  fireEvent.pointerEnter(elsewhere);
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(document.querySelector("[data-slot=tooltip]")).not.toBeNull();
  fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
  expect(log).toEqual(["close"]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.querySelector("[data-slot=tooltip]")).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

test("popover_menu_press_outside_closes_without_moving_focus", async () => {
  const log: string[] = [];
  render(<Host log={log} />);
  // Radix starts listening for outside presses on the next task.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  fireEvent.pointerDown(document.body);
  expect(log).toEqual(["close"]);
  expect(document.activeElement).not.toBe(trigger());
});

test("popover_menu_read_only_marks_radios_aria_disabled", async () => {
  const log: string[] = [];
  render(
    <Host
      log={log}
      readOnly
      heading="Classic · 25 / 5"
      description="Presets can change between sessions."
    />,
  );
  const menu = screen.getByRole("menu");
  expect(rowName("Classic").getAttribute("aria-checked")).toBe("true");
  for (const r of screen.getAllByRole("menuitemradio"))
    expect(r.getAttribute("aria-disabled")).toBe("true");
  expect(rowName("Timer settings").hasAttribute("aria-disabled")).toBe(false);
  expect(screen.getByText("Presets can change between sessions.")).toBeTruthy();
  expect(menu).toHaveAccessibleDescription("Presets can change between sessions.");
  await key("ArrowDown");
  await key("Enter");
  expect(log).toEqual([]);
  expect(screen.getByRole("menu")).toBeTruthy();
  await key("End");
  await key("Enter");
  expect(log).toEqual(["settings", "close"]);
});

test("popover_menu_focus_window_form_has_no_settings_row", () => {
  render(
    <Host
      log={[]}
      heading="Preset for the next session"
      description="Choosing one applies it and closes."
      items={PRESETS}
    />,
  );
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(4);
  expect(screen.queryByRole("menuitem")).toBeNull();
  expect(screen.queryByText("Timer settings…")).toBeNull();
  expect(document.querySelector('[role="separator"]')).toBeNull();
});

function InDialog() {
  const anchor = useRef<HTMLSpanElement>(null);
  return (
    <dialog open data-testid="dlg">
      <span ref={anchor}>
        <button type="button">Trigger</button>
      </span>
      <PopoverMenu
        anchor={anchor}
        heading="Preset"
        items={PRESETS}
        onSelect={() => {}}
        onClose={() => {}}
      />
    </dialog>
  );
}

test("popover_menu_renders_inside_open_dialog", () => {
  const { unmount } = render(<InDialog />);
  const dialog = screen.getByTestId("dlg");
  expect(document.querySelector(PANEL)?.closest("dialog")).toBe(dialog);
  expect(within(dialog).getByRole("menu")).toBeTruthy();
  unmount();

  render(<Host log={[]} />);
  // Radix wraps the panel in its own positioning element, which is the body's child.
  expect(document.querySelector(PANEL)?.parentElement?.parentElement).toBe(document.body);
});

test("popover_menu_adds_no_live_region", () => {
  const forms: Partial<Parameters<typeof PopoverMenu>[0]>[] = [
    {},
    { readOnly: true, description: "Presets can change between sessions." },
    { singleKeys: true },
  ];
  for (const f of forms) {
    const { unmount } = render(<Host log={[]} {...f} />);
    expect(document.querySelectorAll('[role="status"],[role="alert"],[aria-live]')).toHaveLength(0);
    unmount();
  }
});

test("popover_menu_host_close_without_focusing_trigger_returns_focus_to_trigger", async () => {
  const log: string[] = [];
  render(<Host log={log} />);
  await settle();
  expect(document.activeElement).not.toBe(trigger());
  fireEvent.click(trigger());
  await settle();
  expect(document.querySelector(PANEL)).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

test("popover_menu_click_row_selects_and_closes", async () => {
  const log: string[] = [];
  render(<Host log={log} />);
  await settle();
  fireEvent.click(rowName("Deep Block"));
  await settle();
  expect(log).toEqual(["deep", "close"]);
  expect(document.activeElement).toBe(trigger());
});

test("popover_menu_click_read_only_row_does_nothing", async () => {
  const log: string[] = [];
  render(<Host log={log} readOnly />);
  await settle();
  fireEvent.click(rowName("Deep Block"));
  await settle();
  expect(log).toEqual([]);
});

test("popover_menu_caps_height_at_radix_available_height", () => {
  render(<Host log={[]} />);
  const panel = document.querySelector(PANEL) as HTMLElement;
  expect(panel.style.maxBlockSize).toBe("var(--radix-dropdown-menu-content-available-height)");
  expect(panel.className).not.toContain("max-h-screen");
});
