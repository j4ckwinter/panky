import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@jack.winter/pancake-ui/styles.css";
import "@jack.winter/pancake-ui/fonts.css";
import "./styles.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
