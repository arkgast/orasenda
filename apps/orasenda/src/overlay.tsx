import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "./spike/Overlay";
import "@orasenda/ui/components.css";
import "./spike/overlay.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("overlay.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
