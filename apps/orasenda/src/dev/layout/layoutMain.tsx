import { mockIPC } from "@tauri-apps/api/mocks";
import { createRoot } from "react-dom/client";
import { App } from "../../app/App";
// The design system first, so the app's own rules can build on it.
import "@orasenda/ui/styles.css";
import "../../styles/app.css";
import { SCENARIO_NAMES, scenarioHandler } from "./scenarios";

// `layout.html?scenario=<name>[&page=settings][&popover=1]`: the real App against mockIPC, no Tauri.
// A dev page for verification/layout; it is not a build input.
const query = new URLSearchParams(location.search);
const name = query.get("scenario") ?? "idle";
const handler = scenarioHandler(name);
const root = document.getElementById("root");
if (!root) throw new Error("layout.html has no #root element");
if (!handler) {
  throw new Error(`unknown scenario "${name}"; use one of ${SCENARIO_NAMES.join(", ")}`);
}

mockIPC(handler, { shouldMockEvents: true });
createRoot(root).render(<App />);

const page = query.get("page");
if (page !== null && page !== "settings") {
  throw new Error(`unknown page "${page}"; use "settings" or leave it out`);
}
if (page === "settings") {
  // The rail is the way to Settings; wait for it to render, then press it as a person would.
  const started = Date.now();
  const timer = setInterval(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (el) => el.getAttribute("aria-label") === "Settings" || el.textContent?.trim() === "Settings",
    );
    if (button) {
      clearInterval(timer);
      button.click();
    } else if (Date.now() - started > 5000) {
      clearInterval(timer);
      throw new Error("Settings rail button not found");
    }
  }, 50);
}
