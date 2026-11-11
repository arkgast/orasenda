import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "./Overlay";
import "@orasenda/ui/styles.css";
import "./overlay.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("overlay.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
