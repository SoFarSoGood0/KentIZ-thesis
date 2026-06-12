
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { initTheme } from "./app/lib/theme";
  import "./styles/index.css";

  initTheme();

  createRoot(document.getElementById("root")!).render(<App />);
