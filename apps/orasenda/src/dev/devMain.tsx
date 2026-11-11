import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@orasenda/ui/styles.css";
import "./dev.css";
import { DevPanel } from "./DevPanel";

const root = document.getElementById("root");
if (!root) {
  throw new Error("dev.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <DevPanel />
  </StrictMode>,
);
