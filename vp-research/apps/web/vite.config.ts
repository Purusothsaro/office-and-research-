import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";

const require = createRequire(import.meta.url);
const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

/**
 * Serves the OCR engine (Tesseract WebAssembly, worker and English model) from
 * this app's own origin, so OCR runs entirely in the browser and no document
 * or request goes to a third party.
 */
function ocrAssets(): Plugin {
  const core = pkgDir("tesseract.js-core");
  const files: Record<string, string> = {
    "ocr/worker.min.js": join(pkgDir("tesseract.js"), "dist", "worker.min.js"),
    "ocr/lang/eng.traineddata.gz": join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"),
  };
  // LSTM engine builds only (plain, SIMD and relaxed SIMD); the worker picks the one the browser supports.
  for (const f of readdirSync(core).filter((n) => /^tesseract-core(-[a-z]+)?-lstm\.(js|wasm|wasm\.js)$/.test(n))) files[`ocr/core/${f}`] = join(core, f);
  const types: Record<string, string> = { js: "text/javascript", wasm: "application/wasm", gz: "application/gzip" };
  return {
    name: "octo-ocr-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0]?.replace(/^\//, "");
        const file = path ? files[path] : undefined;
        if (!file) return next();
        res.setHeader("Content-Type", types[file.split(".").pop()!] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(files)) this.emitFile({ type: "asset", fileName, source: readFileSync(file) });
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss(), ocrAssets()],
  resolve: { dedupe: ["react", "react-dom"] },
  // The API server (MongoDB-backed) runs on :3040; Vite forwards /api to it.
  server: { port: 1580, strictPort: true, proxy: { "/api": { target: "http://127.0.0.1:3040", changeOrigin: false } } },
  preview: { port: 4174, strictPort: true },
  build: { sourcemap: true, chunkSizeWarningLimit: 2500 },
});
