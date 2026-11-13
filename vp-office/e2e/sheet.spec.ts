import { expect, test, type Page } from "./fixtures/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Playwright's loader can't import exceljs as ESM; load it through require.
const ExcelJS = createRequire(import.meta.url)("exceljs") as typeof import("exceljs");

async function goTo(page: Page, ref: string) {
  // Univer's name box (cell reference input) jumps to a cell or range.
  const nameBox = page.locator('input[class*="univer-size-full"]').first();
  await nameBox.click();
  await nameBox.fill(ref);
  await nameBox.press("Enter");
}

async function typeInCell(page: Page, ref: string, text: string) {
  await goTo(page, ref);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function openTimeSheet(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "All templates" }).click();
  await page.getByRole("button", { name: /Billable time sheet/ }).click();
  await page.locator('[data-testid="sheet-grid"] canvas').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
}

test("edits cells and formulas, saves to XLSX and reopens", async ({ page }) => {
  await openTimeSheet(page);
  // Opening and calculating formulas must not count as an edit.
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();

  await typeInCell(page, "B6", "Settlement review");
  await typeInCell(page, "D6", "=SUM(D2:D3)*2");
  await expect(page.locator('[data-save-status="unsaved"], [data-save-status="saving"]')).toBeVisible();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await page.locator('[data-testid="sheet-grid"] canvas').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await readFile((await (await downloadPromise).path())!)) as never);
  const ws = book.getWorksheet("Time entries")!;
  expect(ws.getCell("B6").value).toBe("Settlement review");
  expect(ws.getCell("D6").formula).toBe("SUM(D2:D3)*2");
  expect((ws.getCell("D6").value as { result?: number }).result).toBe(4.5);
  expect(ws.getCell("F4").formula).toBe("SUM(F2:F3)");
});

test("draws a chart from a selected range", async ({ page }) => {
  await openTimeSheet(page);
  await page.getByRole("button", { name: "Charts" }).click();
  await goTo(page, "C1:D3");
  await page.getByRole("complementary", { name: "Charts" }).getByRole("button", { name: "Bar" }).click();
  await expect(page.getByRole("img", { name: /bar chart/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /bar chart/ }).locator("svg")).toBeAttached();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await page.locator('[data-testid="sheet-grid"] canvas').first().waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Charts" }).click();
  await expect(page.getByRole("img", { name: /bar chart/ })).toBeVisible();
});

test("edits a CSV file and keeps it as CSV", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "clients.csv", mimeType: "text/csv", buffer: Buffer.from("name,amount\nAcme,100\nBeta,250\n") });
  await page.getByRole("button", { name: /^clients\.csv,/ }).click();
  await page.locator('[data-testid="sheet-grid"] canvas').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByText(/CSV files keep only the first sheet's values/)).toBeVisible();
  await typeInCell(page, "B4", "=B2+B3");
  await typeInCell(page, "A4", "Total");
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 20_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv.split(/\r?\n/)).toEqual(["name,amount", "Acme,100", "Beta,250", "Total,350"]);
});
