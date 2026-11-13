import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: "core", include: ["packages/core/src/**/*.test.ts"], environment: "node", testTimeout: 60000 } },
      {
        extends: true,
        test: {
          name: "storage",
          include: ["packages/storage/src/**/*.test.ts"],
          environment: "node",
          setupFiles: ["fake-indexeddb/auto"],
        },
      },
      {
        extends: true,
        test: { name: "editor-document", include: ["packages/editor-document/src/**/*.test.ts"], environment: "jsdom", testTimeout: 20000 },
      },
      { extends: true, test: { name: "editor-sheet", include: ["packages/editor-sheet/src/**/*.test.ts"], environment: "node", testTimeout: 30000 } },
      { extends: true, test: { name: "editor-slides", include: ["packages/editor-slides/src/**/*.test.ts"], environment: "jsdom", testTimeout: 30000 } },
      { extends: true, test: { name: "editor-workspace", include: ["packages/editor-workspace/src/**/*.test.ts"], environment: "jsdom", testTimeout: 30000 } },
      { extends: true, test: { name: "server", include: ["apps/server/src/**/*.test.ts"], environment: "node", testTimeout: 30000 } },
      { extends: true, test: { name: "editor-pdf", include: ["packages/editor-pdf/src/**/*.test.ts"], environment: "node", testTimeout: 30000 } },
      {
        extends: true,
        test: {
          name: "web",
          include: ["apps/web/src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["apps/web/src/test/setup.ts"],
          testTimeout: 20000,
        },
      },
    ],
  },
});
