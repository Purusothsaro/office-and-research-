import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./auth/Root";
import "./index.css";

// All data is stored on the server (MongoDB); the browser only signs in and talks to the API.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
