import { FocusPage } from "@features/focus/FocusPage";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The design system first, so the app's own rules can build on it.
import "@orasenda/ui/styles.css";
import "@styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("focus.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <FocusPage />
  </StrictMode>,
);
