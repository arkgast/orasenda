import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
// The design system first, so the app's own rules can build on it.
import "@orasenda/ui/styles.css";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("index.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
