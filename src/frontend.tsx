import "./index.css";
import { ConvexProvider } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { convex } from "./convex";
import { useWare } from "./store";

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>
);

// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
if (import.meta.hot) {
  // Dev only: inspect state from the console with `__ware.getState()`.
  (window as unknown as { __ware: typeof useWare }).__ware = useWare;
  (import.meta.hot.data.root ??= createRoot(elem)).render(app);
} else {
  createRoot(elem).render(app);
}
