import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/** Where the MEDIPAL API server listens in development (see `server/env.mjs`). */
const API_ORIGIN = process.env.VITE_DEV_API_ORIGIN || "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // The browser talks to the Vite origin for `/api/*`; Vite forwards those
    // requests to the API server, so the app stays same-origin (no CORS).
    proxy: {
      "/api": {
        target: API_ORIGIN,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
