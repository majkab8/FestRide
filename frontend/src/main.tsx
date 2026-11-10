import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Apply a saved light/dark choice before the first paint.
try {
  const saved = localStorage.getItem("festride-theme");
  if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
} catch { /* storage blocked */ }

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
