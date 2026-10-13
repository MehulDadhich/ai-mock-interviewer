import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/dm-serif-display/latin-400.css";
import "@fontsource/dm-serif-display/latin-400-italic.css";
import "@fontsource-variable/inter";
import App from "./App.jsx";
import { SessionProvider } from "./session.jsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/landing.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>
);
