import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client lives in client/ and builds to dist/, which server.js serves in production.
// In development server.js runs Vite as middleware, so there's no separate dev server or proxy.
export default defineConfig({
  root: "client",
  plugins: [react()],
  // antd is ~850 kB and the lazy-loaded charts chunk ~1.5 MB minified (275/430 kB gzipped); both expected
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 1600 },
});
