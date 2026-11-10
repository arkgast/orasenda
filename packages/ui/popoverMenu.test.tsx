import { fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { expect, test } from "vitest";
import { describeShortcut, IconButton, PopoverMenu } from "./index.ts";

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
};

function Host({
  log,
  startOpen = true,
  keys,
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

const key = (k: string) => fireEvent.keyDown(document.activeElement as Element, { key: k });
const rowName = (n: string) => {
  const row = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((r) =>
    r.textContent?.includes(n),
  );
  if (!row) throw new Error(`no menu row named ${n}`);
  return row;
};
const trigger = () => screen.getByRole("button", { name: "Change preset" });

test("popover_menu_host_trigger_expanded_and_controls_point_at_menu_id", () => {
  const log: string[] = [];
  render(<Host log={log} startOpen={false} />);
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(trigger());
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  const menu = document.getElementById(trigger().getAttribute("aria-controls") as string);
  expect(menu?.getAttribute("role")).toBe("menu");
  expect(menu).toBe(screen.getByRole("menu"));
  expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
  expect(trigger().hasAttribute("aria-keyshortcuts")).toBe(false);
  key("Escape");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("menu")).toBeNull();
});

test("popover_menu_single_keys_controls_p_shortcut", () => {
  const log: string[] = [];
  const { rerender } = render(<Host log={log} singleKeys keys={describeShortcut("P").aria} />);
  const panel = () => document.querySelector(".os-popover-panel") as Element;
  const kbd = panel().querySelector(".os-popover-headline .os-kbd");
  expect(kbd?.textContent).toBe("P");
  expect(kbd?.getAttribute("aria-hidden")).toBe("true");
  expect(trigger().getAttribute("aria-keyshortcuts")).toBe(describeShortcut("P").aria);
  key("p");
  expect(log).toEqual([]);
  rerender(<Host log={log} />);
  expect(panel().querySelector(".os-kbd")).toBeNull();
  expect(trigger().hasAttribute("aria-keyshortcuts")).toBe(false);
  rerender(<Host log={log} singleKeys={false} />);
  expect(panel().querySelector(".os-kbd")).toBeNull();
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

test("popover_menu_arrows_move_and_return_selects", () => {
  const log: string[] = [];
  render(<Host log={log} />);
  expect(document.activeElement).toBe(rowName("Classic"));
  key("ArrowDown");
  expect(document.activeElement).toBe(rowName("Deep Block"));
  expect(rowName("Deep Block").tabIndex).toBe(0);
  expect(rowName("Classic").tabIndex).toBe(-1);
  key("ArrowUp");
  key("ArrowUp");
  expect(document.activeElement).toBe(rowName("Timer settings"));
  key("Home");
  expect(document.activeElement).toBe(rowName("Classic"));
  key("End");
  expect(document.activeElement).toBe(rowName("Timer settings"));
  key("Home");
  key("ArrowDown");
  key("Enter");
  expect(log).toEqual(["deep", "close"]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

test("popover_menu_space_chooses_checkbox", () => {
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
  key("ArrowDown");
  key(" ");
  expect(log).toEqual(["b", "close"]);
});

test("popover_menu_disabled_checkbox_is_focusable_and_never_chosen", () => {
  const log: string[] = [];
  const items: Item[] = [
    { id: "a", label: "First option", kind: "checkbox" },
    { id: "c", label: "Unavailable option", kind: "checkbox", disabled: true },
  ];
  render(<Host log={log} items={items} />);
  key("ArrowDown");
  expect(document.activeElement).toBe(rowName("Unavailable option"));
  expect(rowName("Unavailable option").getAttribute("aria-disabled")).toBe("true");
  key(" ");
  expect(log).toEqual([]);
  expect(screen.getByRole("menu")).toBeTruthy();
});

test("popover_menu_esc_closes_and_returns_focus_to_trigger", () => {
  const log: string[] = [];
  const { unmount } = render(<Host log={log} />);
  expect(document.activeElement).not.toBe(trigger());
  key("Escape");
  expect(log).toEqual(["close"]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());
  unmount();

  const log2: string[] = [];
  render(<Host log={log2} />);
  key("Tab");
  expect(log2).toEqual(["close"]);
  expect(document.activeElement).toBe(trigger());
});

test("popover_menu_press_outside_closes_without_moving_focus", () => {
  const log: string[] = [];
  render(<Host log={log} />);
  fireEvent.pointerDown(document.body);
  expect(log).toEqual(["close"]);
  expect(document.activeElement).not.toBe(trigger());
});

test("popover_menu_read_only_marks_radios_aria_disabled", () => {
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
  key("ArrowDown");
  key("Enter");
  expect(log).toEqual([]);
  expect(screen.getByRole("menu")).toBeTruthy();
  key("End");
  key("Enter");
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
  expect(document.querySelector("hr.os-popover-sep")).toBeNull();
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
  expect(document.querySelector(".os-popover-panel")?.closest("dialog")).toBe(dialog);
  expect(within(dialog).getByRole("menu")).toBeTruthy();
  unmount();

  render(<Host log={[]} />);
  expect(document.querySelector(".os-popover-panel")?.parentElement).toBe(document.body);
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
