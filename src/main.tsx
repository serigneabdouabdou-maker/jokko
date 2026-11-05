import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import "./styles.css";
import { setupPwa } from "./pwa";
import { setupNative } from "./native";
import { watchBugs } from "./data/bugs";

watchBugs("boutique");
setupNative();
setupPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
