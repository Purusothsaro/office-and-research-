import { expect, test, type Page } from "./fixtures/test";
import { readFile } from "node:fs/promises";

// Each test gets a fresh browser context, so IndexedDB starts empty.

async function openHome(page: Page) {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recent files" })).toBeVisible();
}

test("creates a document from a template, renames it and downloads a valid DOCX", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: /Engagement letter/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Engagement letter.docx" })).toBeVisible();
  await page.getByRole("link", { name: "Back to files" }).click();

  const item = page.getByRole("button", { name: /^Engagement letter\.docx,/ });
  await item.focus();
  await page.keyboard.press("F2");
  await page.getByRole("textbox", { name: "Name" }).fill("Smith engagement");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Smith engagement\.docx,/ })).toBeVisible();

  await page.reload();
  const renamed = page.getByRole("button", { name: /^Smith engagement\.docx,/ });
  await expect(renamed).toBeVisible();

  await page.getByRole("button", { name: "More actions for Smith engagement.docx" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Download/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Smith engagement.docx");
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.includes(Buffer.from("word/document.xml"))).toBe(true);
});

test("autosaves a text note and keeps it across reloads", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Text note" }).click();
  const editor = page.getByRole("textbox", { name: /Contents of/ });
  await editor.fill("Call opposing counsel re: discovery schedule.");
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: /Contents of/ })).toHaveValue("Call opposing counsel re: discovery schedule.");
  await expect(page.getByText("Revision 2")).toBeVisible();
});

test("recovers unsaved work after the tab is closed mid-edit", async ({ page, context }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Text note" }).click();
  const editor = page.getByRole("textbox", { name: /Contents of/ });
  await expect(editor).toBeVisible();
  // Make saves fail on the server so only the draft is stored, simulating a crash before save.
  await page.route(/\/api\/files\/[^/]+\/content/, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 503, body: "{}" }) : route.continue()));
  await editor.fill("Privileged draft paragraph");
  await expect(page.locator('[data-save-status="offline"]')).toBeVisible({ timeout: 10_000 });
  await page.close();

  const fresh = await context.newPage();
  await openHome(fresh);
  const banner = fresh.getByRole("region", { name: "Unsaved changes recovered" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: /Restore unsaved changes/ }).click();
  await expect(fresh.getByRole("textbox", { name: /Contents of/ })).toHaveValue("Privileged draft paragraph");
  await fresh.getByRole("button", { name: "Keep and save" }).click();
  await expect(fresh.locator('[data-save-status="saved"]')).toBeVisible();
  await fresh.getByRole("link", { name: "Back to files" }).click();
  await expect(fresh.getByRole("region", { name: "Unsaved changes recovered" })).toHaveCount(0);
});

test("uploads valid files and rejects disguised ones", async ({ page }) => {
  await openHome(page);
  await page.getByTestId("file-input").setInputFiles([
    { name: "Exhibit A.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF") },
    { name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00 not a pdf") },
  ]);
  await expect(page.getByText("invoice.pdf: This file is not a valid PDF.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Exhibit A\.pdf,/ })).toBeVisible();
  await page.getByRole("button", { name: /PDFs/ }).click();
  await expect(page.getByRole("list", { name: "Files" }).getByRole("listitem")).toHaveCount(1);
});

test("works at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await expect(page.getByRole("navigation", { name: "File sections" })).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: /Templates/ }).click();
  await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
