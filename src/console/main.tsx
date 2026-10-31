import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Console } from "./Console";
import "../index.css";
import "../styles.css";
import "./console.css";

// La console n'installe pas l'appli et ne garde rien hors ligne : elle montre toujours les chiffres du moment.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Console />
  </StrictMode>,
);
