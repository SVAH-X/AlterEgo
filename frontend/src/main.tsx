import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { VoiceProvider } from "./voice/VoiceContext";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <VoiceProvider>
      <App />
    </VoiceProvider>
  </StrictMode>,
);
