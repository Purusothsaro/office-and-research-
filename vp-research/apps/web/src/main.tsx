import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./auth/Root";
import { ToastProvider } from "./components/ui";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>,
);
