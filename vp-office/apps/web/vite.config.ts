import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One React instance for the app and editor packages.
  resolve: { dedupe: ["react", "react-dom"] },
  // The API server (MongoDB-backed) runs on :3030; Vite forwards /api to it.
  server: { port: 1570, strictPort: true, proxy: { "/api": { target: "http://127.0.0.1:3030", changeOrigin: false } } },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: true, chunkSizeWarningLimit: 1500 },
});
