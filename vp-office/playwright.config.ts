import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:4173",
    // Uses the locally installed Chrome so no browser download is needed.
    channel: "chrome",
    acceptDownloads: true,
  },
  webServer: {
    // The real server (MongoDB-backed) serving the production build.
    command: "npm run build -w @octo/web && npx tsx apps/server/src/main.ts",
    url: "http://localhost:4173/api/health",
    reuseExistingServer: false,
    timeout: 240_000,
    env: { PORT: "4173", HOST: "127.0.0.1", MONGODB_DB: "octogenie_office_e2e", AUTH_RATE_LIMIT: "10000", LOG: "false" },
  },
});
