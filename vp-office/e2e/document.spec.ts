import { expect, test } from "./fixtures/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

test("edits, paginates, saves, reopens and downloads a document", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Blank document" }).click();
  const doc = page.locator(".doc-flow");
  await expect(doc).toBeVisible();
  await doc.click();

  await page.keyboard.type("Lease Review");
  await page.getByRole("option", { name: "Heading 1" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The tenant must give ");
  await page.keyboard.press("Control+b");
  await page.keyboard.type("90 days");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(" notice.");
  await expect(doc.locator("h1")).toHaveText("Lease Review");
  await expect(doc.locator("strong")).toHaveText("90 days");

  // Table from the Insert tab.
  await page.getByRole("tab", { name: "Insert" }).click();
  await page.getByRole("button", { name: "Table" }).click();
  await page.getByRole("button", { name: "2 by 3 table" }).click();
  await expect(doc.locator("table tr")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "Table" })).toBeVisible();
  await page.keyboard.type("Clause");

  // A page break creates a second page.
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("Schedule 1");
  await expect(page.locator(".doc-status")).toContainText("Page 2 of 2");
  await expect(page.locator(".doc-page-gap")).toHaveCount(1);

  // Page numbers in the footer.
  await page.getByRole("button", { name: "Page numbers" }).click();
  await expect(page.locator(".doc-page-footer").first()).toHaveText("Page 1 of 2");

  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.locator(".doc-flow h1")).toHaveText("Lease Review");
  await expect(page.locator(".doc-flow strong")).toHaveText("90 days");
  await expect(page.locator(".doc-flow table")).toHaveCount(1);
  await expect(page.locator(".doc-status")).toContainText("of 2");
  await expect(page.locator(".doc-page-footer").first()).toHaveText("Page 1 of 2");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Untitled document.docx");
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const xml = await zip.file("word/document.xml")!.async("string");
  expect(xml).toContain("Lease Review");
  expect(xml).toContain("90 days");
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain('w:type="page"');
  expect(Object.keys(zip.files).some((f) => f.startsWith("word/footer"))).toBe(true);
});

test("changes page layout", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Blank document" }).click();
  await expect(page.locator(".doc-flow")).toBeVisible();
  const width = async () => page.locator(".doc-paper").evaluate((el) => (el as HTMLElement).offsetWidth);
  expect(await width()).toBe(816); // Letter portrait: 8.5in at 96 px/in
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByRole("button", { name: "Orientation" }).click();
  await page.getByRole("button", { name: "Landscape" }).click();
  await expect.poll(width).toBe(1056);
  await page.getByRole("button", { name: "Size" }).click();
  await page.getByRole("button", { name: /^A4/ }).click();
  await expect.poll(width).toBe(1123);
});

test("finds text with Ctrl+F", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Mutual NDA/ }).click();
  await expect(page.locator(".doc-flow")).toBeVisible();
  await page.locator(".doc-flow").click();
  await page.keyboard.press("Control+f");
  await page.getByRole("textbox", { name: "Find" }).fill("Confidential Information");
  await expect(page.getByRole("search").getByText(/^1 of \d+$/)).toBeVisible();
  await expect(page.locator(".doc-search-current")).toHaveCount(1);
});

test("inserts an equation, footnote and link through dialogs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Blank document" }).click();
  await page.locator(".doc-flow").click();
  await page.keyboard.type("Formula ");
  await page.getByRole("tab", { name: "Insert" }).click();
  await page.getByRole("button", { name: "Equation" }).click();
  await page.getByRole("textbox", { name: "LaTeX" }).fill(String.raw`\frac{a}{b} \times \sum_{i=1}^{n} x_i`);
  await expect(page.getByLabel("Preview").locator(".katex")).toBeVisible();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  const math = page.locator(".doc-flow .katex");
  await expect(math).toBeVisible();
  await expect(page.locator(".doc-flow .katex-error")).toHaveCount(0);
  await expect(math.locator(".mfrac")).toHaveCount(1);

  await page.getByRole("button", { name: "Footnote" }).click();
  await page.getByRole("textbox", { name: "Footnote text" }).fill("Source: annual report.");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.locator(".doc-footnote")).toContainText("Source: annual report.");

  await page.keyboard.type(" see ");
  await page.getByRole("button", { name: "Link" }).click();
  await page.getByRole("textbox", { name: "Address" }).fill("javascript:alert(1)");
  await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Address" }).fill("https://example.com");
  await page.getByRole("textbox", { name: "Text to display" }).fill("the source");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator('.doc-flow a[href="https://example.com"]')).toHaveText("the source");
});
