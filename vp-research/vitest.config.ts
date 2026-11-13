import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: "core", include: ["packages/core/src/**/*.test.ts"], environment: "node", testTimeout: 60000 } },
      { extends: true, test: { name: "editor-document", include: ["packages/editor-document/src/**/*.test.ts"], environment: "jsdom", testTimeout: 20000 } },
      { extends: true, test: { name: "research", include: ["packages/research/src/**/*.test.ts"], environment: "node", testTimeout: 60000 } },
      { extends: true, test: { name: "server", include: ["apps/server/src/**/*.test.ts"], environment: "node", testTimeout: 30000 } },
    ],
  },
});
