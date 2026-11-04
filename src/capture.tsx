// Branche de capture uniquement : affiche un écran de Jokko avec la boutique exemple, sans compte, pour la fiche d'installation.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Desk, Login } from "./App";
import { demoProfile } from "./data/demo";
import type { Profile } from "./model";
import "./index.css";
import "./styles.css";

try {
  localStorage.setItem("jokko.install.hidden", "1");
} catch {
  /* rien */
}

const base: Profile = { phone: "221775674725", owner: "Fallou", lang: "fr", role: "patron", geminiKey: "", speak: false, shopId: "", shops: [], termsVersion: "2026-10-31" };

function Shop() {
  const [profile, setProfile] = useState<Profile>(() => {
    const p = demoProfile(base);
    const trial = { plan: "gratuit" as const, until: null, trialUntil: new Date(Date.now() + 12 * 86400000).toISOString() };
    return { ...p, shops: p.shops.map((s) => ({ ...s, name: "Boutique Fallou", plan: trial })) };
  });
  return <Desk profile={profile} setProfile={setProfile} />;
}

const view = new URLSearchParams(window.location.search).get("v");
createRoot(document.getElementById("root")!).render(
  <StrictMode>{view === "creer" || view === "entrer" ? <Login mode={view} onBack={() => undefined} /> : <Shop />}</StrictMode>,
);
