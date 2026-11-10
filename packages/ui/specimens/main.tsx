import { createRoot } from "react-dom/client";
import "@orasenda/tokens/tokens.css";
import "../src/styles.css";
import "./specimens.css";
import { specimens } from "./registry.ts";

// describeShortcut throws on an unknown glyph string in specimens, as in tests.
window.Orasenda = { ...window.Orasenda, strictShortcuts: true };

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

const name = params.get("c") ?? "";
const Specimen = Object.hasOwn(specimens, name) ? specimens[name] : undefined;
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    Specimen ? (
      <Specimen />
    ) : (
      <p className="specimen-label">No specimen named {name || "(none)"}.</p>
    ),
  );
}
