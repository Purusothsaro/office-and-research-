import { expect, test } from "@playwright/test";

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}@example.com`;

test("signs up, keeps files per account and signs back in", async ({ page }) => {
  const alice = `alice-${unique()}`;
  const bob = `bob-${unique()}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Alice");
  await page.getByLabel("Email").fill(alice);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Recent files" })).toBeVisible();
  await page.getByTestId("file-input").setInputFiles({ name: "Alice notes.txt", mimeType: "text/plain", buffer: Buffer.from("private") });
  await expect(page.getByRole("button", { name: /^Alice notes\.txt,/ })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(bob);
  await page.getByLabel("Password").fill("another strong pass");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("No files yet.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.getByLabel("Email").fill(alice);
  await page.getByLabel("Password").fill("wrong password!!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: /^Alice notes\.txt,/ })).toBeVisible();
});
