import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SuiviCouture } from "./components/jokko/Suivi";
import "./index.css";
import "./styles.css";
import { setupPwa } from "./pwa";
import { setupNative } from "./native";
import { watchBugs } from "./data/bugs";

watchBugs("boutique");
setupNative();
setupPwa();

// Lien de suivi d'une commande de couture (envoyé au client par son tailleur) : page publique, sans compte.
const suivi = new URLSearchParams(window.location.search).get("suivi");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {suivi ? <SuiviCouture token={suivi} /> : <App />}
  </StrictMode>,
);
