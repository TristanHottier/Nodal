import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BenchPage } from "./BenchPage";

const container = document.getElementById("root");
if (container === null) throw new Error("#root element not found");
createRoot(container).render(
  <StrictMode>
    <BenchPage />
  </StrictMode>,
);
