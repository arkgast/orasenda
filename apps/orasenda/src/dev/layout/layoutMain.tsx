import { mockIPC } from "@tauri-apps/api/mocks";
import { createRoot } from "react-dom/client";
import { App } from "../../app/App";
import { CapturePage } from "../../features/capture/CapturePage";
import { FloaterPage } from "../../features/floater/FloaterPage";
import { FocusPage } from "../../features/focus/FocusPage";
import { events } from "../../shared/ipc/bindings";
// The design system first, so the app's own rules can build on it.
import "@orasenda/ui/styles.css";
import "../../styles/app.css";
import { displaysFor, SCENARIO_NAMES, scenarioHandler } from "./scenarios";

// `layout.html?scenario=<name>[&page=settings][&popover=1]`: the real App against mockIPC, no Tauri.
// `&surface=focus|floater|capture` renders that window's page instead (the Focus window reads
// `&insets=t,r,b,l` from this same query, as it does from `focus.html`), and `&displays=1|2|3`
// sets how many displays `displays_list` answers.
// A dev page for verification/layout; it is not a build input.
const query = new URLSearchParams(location.search);
const name = query.get("scenario") ?? "idle";
const scenario = scenarioHandler(name);
const displays = displaysFor(Number(query.get("displays") ?? "1"));
const handler = scenario
  ? (cmd: string, args: unknown) => (cmd === "displays_list" ? displays : scenario(cmd, args))
  : undefined;
const root = document.getElementById("root");
if (!root) throw new Error("layout.html has no #root element");
if (!handler) {
  throw new Error(`unknown scenario "${name}"; use one of ${SCENARIO_NAMES.join(", ")}`);
}

const surface = query.get("surface");
if (surface !== null && surface !== "focus" && surface !== "floater" && surface !== "capture") {
  throw new Error(
    `unknown surface "${surface}"; use "focus", "floater", "capture" or leave it out`,
  );
}

mockIPC(handler, { shouldMockEvents: true });
createRoot(root).render(
  surface === "focus" ? (
    <FocusPage />
  ) : surface === "floater" ? (
    <FloaterPage />
  ) : surface === "capture" ? (
    <CapturePage />
  ) : (
    <App />
  ),
);

if (surface !== null && name === "ended") {
  // The `ended` scenario is a milestone, which a Focus window or floater takes from the event
  // (it never calls `timer_state`): send it once the page is listening.
  const emitEnded = () =>
    void events.timerMilestone.emit({
      kind: "ended",
      endReason: "completed",
      sessionId: "s1",
      phase: "focus",
      quick: false,
    });
  // Specs call this once the stub is visible (deterministic); by eye, the timer sends it.
  (window as unknown as { __layoutEmitEnded?: () => void }).__layoutEmitEnded = emitEnded;
  setTimeout(emitEnded, 200);
}

const page = query.get("page");
if (page !== null && page !== "settings") {
  throw new Error(`unknown page "${page}"; use "settings" or leave it out`);
}
if (page === "settings") {
  // Press the rail's Settings button as a person would; a compact window has no rail, so use the
  // page chord (Cmd+6) there, until the page is up (the shortcut listener mounts a tick later).
  const started = Date.now();
  const timer = setInterval(() => {
    // The pane list marks the page as up on any pane: a spec may already have left General, and
    // another Cmd+6 would be a new arrival that pulls focus back to the title.
    if (document.querySelector('nav[aria-label="Settings"]')) {
      clearInterval(timer);
      return;
    }
    const button = Array.from(document.querySelectorAll("button")).find(
      (el) => el.getAttribute("aria-label") === "Settings" || el.textContent?.trim() === "Settings",
    );
    if (button) {
      clearInterval(timer);
      button.click();
    } else if (Date.now() - started > 5000) {
      clearInterval(timer);
      throw new Error("Settings did not open (no rail button, and Cmd+6 did not open it)");
    } else {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "6", metaKey: true }));
    }
  }, 50);
}

if (query.get("popover") === "1") {
  // Open the preset popover as a person would: press the summary once it is up.
  const started = Date.now();
  const timer = setInterval(() => {
    const summary = document.querySelector<HTMLButtonElement>(
      '[data-slot="preset-summary"] button:not([aria-disabled="true"])',
    );
    if (summary) {
      clearInterval(timer);
      summary.click();
    } else if (Date.now() - started > 5000) {
      clearInterval(timer);
      throw new Error("popover=1: the preset summary never appeared");
    }
  }, 50);
}
