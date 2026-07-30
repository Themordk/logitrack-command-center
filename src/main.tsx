import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initOrientationLock } from "./lib/lockOrientation";

initOrientationLock();

createRoot(document.getElementById("root")!).render(<App />);
