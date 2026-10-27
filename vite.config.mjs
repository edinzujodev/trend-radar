import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client lives in client/ and builds to dist/, which server.js serves in production.
// In development server.js runs Vite as middleware, so there's no separate dev server or proxy.
export default defineConfig({
  root: "client",
  plugins: [react()],
  // antd alone is ~800 kB minified (~260 kB gzipped); that's expected, not worth splitting for one page
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 1000 },
});
