import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FloaterPage } from "./FloaterPage";
// The design system first, so the app's own rules can build on it.
import "@orasenda/ui/styles.css";
import "../../styles/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("floater.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <FloaterPage />
  </StrictMode>,
);
