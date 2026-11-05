import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Console } from "./Console";
import "../index.css";
import "../styles.css";
import "./console.css";
import { setupPwa } from "../pwa";

// La console s'installe comme une application (« Jokko Admin ») et reçoit les notifications ;
// elle ne garde rien hors ligne : elle montre toujours les chiffres du moment.
setupPwa();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Console />
  </StrictMode>,
);
