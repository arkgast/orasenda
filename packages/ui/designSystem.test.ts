// The Design System artifact build: bundle.js is a classic script that renders every export.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Script } from "node:vm";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, test } from "vitest";
import * as ui from "./src/index.ts";

// The runtime surface before the code-first move (window.Orasenda of the hand-written bundle.js).
const PREVIOUS_SURFACE = [
  "Button",
  "ModeChip",
  "TimerRing",
  "TimerStrip",
  "timerLayout",
  "MenuBarTimer",
  "TaskCard",
  "TimeBlock",
  "HabitDots",
  "RoutineItem",
  "WellnessNote",
  "IntentPrompt",
  "Dialog",
  "FullScreenFocus",
  "Input",
  "TextArea",
  "CapturePad",
  "InlineNotice",
  "Toast",
  "NavRail",
  "KanbanColumn",
  "CommandPalette",
  "EmptyState",
  "StartButton",
  "NowLine",
  "PageFrame",
  "ScrollRegion",
  "SettingsIndex",
  "SettingsRow",
  "IconButton",
  "Tooltip",
  "Kbd",
  "describeShortcut",
  "PopoverMenu",
];

// `just design-system-check` builds once and passes the folder in DS_OUT; alone, the test builds its own.
const prebuilt = process.env.DS_OUT;
const scratch = mkdtempSync(join(tmpdir(), "ui-ds-test-"));
const out = prebuilt ?? join(scratch, "system");
const file = (...p: string[]) => readFileSync(join(out, ...p), "utf8");

beforeAll(async () => {
  if (prebuilt) return;
  const { generate } = await import("./design-system/build.ts");
  await generate(out);
}, 240_000);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

test("exports_match_previous_surface", () => {
  expect(Object.keys(ui).sort()).toEqual([...PREVIOUS_SURFACE].sort());
  for (const name of PREVIOUS_SURFACE) {
    expect(typeof (ui as Record<string, unknown>)[name], name).toBe("function");
  }
});

test("design_system_bundle_header_lists_runtime_exports", () => {
  const index = readFileSync(resolve(import.meta.dirname, "src/index.ts"), "utf8");
  const names = [...index.matchAll(/^export \{ (\w+) \} from /gm)].map((m) => m[1]);
  const components = names.filter((n) => /^[A-Z]/.test(n));
  expect(components).toHaveLength(32);
  const first = file("components", "bundle.js").split("\n")[0] as string;
  expect(first).toBe(
    `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: "Orasenda", components: components.map((name) => ({ name })) })} */`,
  );
});

test("design_system_bundle_loads_as_classic_script", () => {
  for (const name of ["bundle.js", "lib/react.js", "lib/react-dom.js"]) {
    const code = file("components", name);
    expect(() => new Script(code, { filename: name }), name).not.toThrow();
    expect(code, name).not.toContain("</script");
    expect(code, name).not.toContain("<!--");
    expect(code, name).not.toMatch(/^\s*(import|export)\s/m);
  }
  const json = JSON.parse(file("design-system.json"));
  expect(json.editing).toBe("code");
  expect(json.libraries).toEqual([
    { name: "react", version: "19.3.1", global: "React", file: "components/lib/react.js" },
    {
      name: "react-dom",
      version: "19.3.1",
      global: "ReactDOM",
      file: "components/lib/react-dom.js",
    },
  ]);
  expect(file("components", "bundle.css")).not.toMatch(/@import/);
  expect(file("components", "Kbd", "preview.html").split("\n")[0]).toMatch(
    /^<!-- @dsCard group="[^"]+" height=\d+ -->$/,
  );
});

const noop = () => {};
// Minimal props for every component export; the two functions are called instead.
const MINIMAL: Record<string, Record<string, unknown>> = {
  Button: { children: "Go" },
  ModeChip: { mode: "focus" },
  TimerRing: { remaining: "25:00", progress: 0.4, mode: "focus" },
  TimerStrip: { remaining: "25:00", progress: 0.4, mode: "focus" },
  MenuBarTimer: { remaining: "25:00", progress: 0.4, mode: "focus" },
  TaskCard: { title: "Write" },
  TimeBlock: { type: "deep", title: "Deep", start: "09:00", end: "10:00" },
  HabitDots: { days: ["done", "rest"] },
  RoutineItem: { label: "Stretch" },
  WellnessNote: { children: "Drink water" },
  IntentPrompt: { open: true, app: "Safari", onReturn: noop },
  Dialog: { open: true, title: "Title", children: "Body" },
  FullScreenFocus: { remaining: "25:00", onExit: noop },
  Input: { label: "Name" },
  TextArea: { label: "Note" },
  CapturePad: {
    open: true,
    value: "",
    kind: "internal",
    onChange: noop,
    onSave: noop,
    onClose: noop,
  },
  InlineNotice: { children: "Saved" },
  Toast: { children: "Saved" },
  NavRail: { current: "today", onNavigate: noop },
  KanbanColumn: { title: "Next", count: 0 },
  CommandPalette: {
    open: true,
    commands: [{ id: "a", label: "Start" }],
    onSelect: noop,
    onClose: noop,
  },
  EmptyState: { title: "Nothing here", message: "Take it easy" },
  StartButton: { onStart: noop, onQuickStart: noop },
  NowLine: { time: "09:41" },
  PageFrame: { title: "Today", children: "Body" },
  ScrollRegion: { label: "Tasks", children: "Body" },
  SettingsIndex: {
    sections: [{ id: "a", name: "General", value: "On" }],
    current: "a",
    onJump: noop,
  },
  SettingsRow: { id: "r", label: "Row", helper: "Help" },
  IconButton: { label: "Close", icon: null },
  Tooltip: { label: "Hint", children: "Anchor" },
  Kbd: { keys: "⌘." },
  PopoverMenu: {
    heading: "Presets",
    items: [{ id: "a", label: "Classic", kind: "radio", checked: true }],
    onSelect: noop,
    onClose: noop,
    anchor: { current: null },
  },
};

/** Loads the built classic scripts into a fresh jsdom window, as a page of the artifact would. */
function loadWindow() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  // biome-ignore lint/suspicious/noExplicitAny: the jsdom window is driven loosely, as a page would
  const w = dom.window as unknown as Record<string, any>;
  const errors: string[] = [];
  w.console.error = (...a: unknown[]) => errors.push(a.map(String).join(" "));
  w.addEventListener("error", (e: ErrorEvent) => errors.push(String(e.error ?? e.message)));
  w.HTMLDialogElement.prototype.showModal = function (this: HTMLElement) {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function (this: HTMLElement) {
    this.removeAttribute("open");
  };
  w.Element.prototype.scrollIntoView = () => {};
  // jsdom has no ResizeObserver; Radix Popper (PopoverMenu) and cmdk (CommandPalette) use it.
  w.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  w.Orasenda = { strictShortcuts: true };
  for (const name of ["lib/react.js", "lib/react-dom.js", "bundle.js"]) {
    w.eval(file("components", name));
  }
  return { dom, w, errors };
}

/** Portalled components (Dialog, PopoverMenu) render outside their host; count them as rendered. */
// biome-ignore lint/suspicious/noExplicitAny: loose jsdom window
function portalled(w: Record<string, any>): boolean {
  return w.document.querySelector("[data-slot=dialog-content], [data-slot=popover-menu]") !== null;
}

/** Renders each named export with its minimal props; returns the names that threw or logged an error. */
// biome-ignore lint/suspicious/noExplicitAny: the jsdom window is driven loosely, as a page would
function renderAll(w: Record<string, any>, errors: string[], names: readonly string[]): string[] {
  const failed: string[] = [];
  for (const name of names) {
    const props = MINIMAL[name];
    expect(props, `minimal props for ${name}`).toBeDefined();
    const before = errors.length;
    const host = w.document.createElement("div");
    w.document.body.appendChild(host);
    const root = w.ReactDOM.createRoot(host);
    try {
      w.ReactDOM.flushSync(() => root.render(w.React.createElement(w.Orasenda[name], props)));
      if (errors.length > before || (host.innerHTML.length === 0 && !portalled(w)))
        failed.push(name);
      w.ReactDOM.flushSync(() => root.unmount());
    } catch {
      failed.push(name);
    }
    host.remove();
  }
  return failed;
}

test("design_system_renders_every_export", () => {
  const { dom, w, errors } = loadWindow();
  expect(w.React.version).toBe("19.3.1");
  const O = w.Orasenda;
  expect(Object.keys(O).sort()).toEqual(expect.arrayContaining([...PREVIOUS_SURFACE]));
  expect(O.strictShortcuts).toBe(true);
  expect(O.timerLayout({ contentWidth: 400, contentHeight: 400, windowWidth: 400 })).toBeTypeOf(
    "string",
  );
  expect(O.describeShortcut("⌘.").aria).toBe("Meta+Period");
  expect(
    renderAll(
      w,
      errors,
      PREVIOUS_SURFACE.filter((n) => /^[A-Z]/.test(n)),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
  dom.window.close();
});

test("design_system_check_fails_when_a_seeded_export_throws_on_render", () => {
  const { dom, w, errors } = loadWindow();
  w.Orasenda.Boom = () => {
    throw new Error("seeded: throws on render");
  };
  MINIMAL.Boom = {};
  try {
    expect(renderAll(w, errors, ["Button", "Boom"])).toEqual(["Boom"]);
  } finally {
    delete MINIMAL.Boom;
    dom.window.close();
  }
});

test("design_system_check_fails_when_a_seeded_export_renders_nothing", () => {
  const { dom, w, errors } = loadWindow();
  w.Orasenda.Empty = () => null;
  MINIMAL.Empty = {};
  try {
    expect(renderAll(w, errors, ["Button", "Empty"])).toEqual(["Empty"]);
  } finally {
    delete MINIMAL.Empty;
    dom.window.close();
  }
});
