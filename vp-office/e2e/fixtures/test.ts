import { test as base, expect } from "@playwright/test";

/** Every test signs up a fresh account, so tests never see each other's files. */
export const test = base.extend<{ account: { email: string } }>({
  account: [
    async ({ page }, use) => {
      const email = `user-${Date.now()}-${Math.floor(Math.random() * 1e9)}@example.com`;
      const res = await page.request.post("/api/auth/register", {
        data: { email, password: "correct horse battery", name: "Test User" },
        headers: { "X-Octo-Client": "web" },
      });
      expect(res.ok()).toBe(true);
      await use({ email });
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from "@playwright/test";
