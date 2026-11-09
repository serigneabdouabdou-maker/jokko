import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SuiviCouture } from "./components/jokko/Suivi";
import { ModelePublic } from "./components/jokko/ModelePublic";
import { VitrinePublic } from "./components/jokko/VitrinePublic";
import "./index.css";
import "./styles.css";
import { setupPwa } from "./pwa";
import { setupNative } from "./native";
import { watchBugs } from "./data/bugs";

watchBugs("boutique");
setupNative();
setupPwa();

// Lien de suivi d'une commande de couture (envoyé au client par son tailleur) : page publique, sans compte.
const params = new URLSearchParams(window.location.search);
const suivi = params.get("suivi");
// Modèle du Studio partagé sur WhatsApp par un tailleur : page publique, sans compte.
const modele = params.get("modele");
// Vitrine d'une entreprise (statut WhatsApp, Facebook, TikTok) : page publique, sans compte.
const vitrine = params.get("v");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {suivi ? <SuiviCouture token={suivi} /> : modele ? <ModelePublic id={modele} shopId={params.get("t")} /> : vitrine ? <VitrinePublic slug={vitrine} /> : <App />}
  </StrictMode>,
);
