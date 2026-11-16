import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OcrSnipOverlay } from "./components/OcrSnipOverlay";

const isOcrSnip = new URLSearchParams(window.location.search).get("mode") === "ocr-snip";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOcrSnip ? <OcrSnipOverlay /> : <App />}
  </React.StrictMode>,
);
