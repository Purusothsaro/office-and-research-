import { expect, test, type Page } from "./fixtures/test";
import { samplePdf } from "./fixtures/make-pdf";

async function selectText(page: Page, span: ReturnType<Page["locator"]>) {
  const b = (await span.boundingBox())!;
  await page.mouse.move(b.x + 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("builds a case workspace from a deposition and exports an outline", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "Smith Deposition.pdf", mimeType: "application/pdf", buffer: await samplePdf() });
  await expect(page.getByRole("button", { name: /^Smith Deposition\.pdf,/ })).toBeVisible();

  await page.getByRole("button", { name: "Case workspace" }).click();
  await expect(page.getByRole("toolbar", { name: "Workspace tools" })).toBeVisible({ timeout: 30_000 });

  // Add the deposition.
  await page.getByRole("button", { name: "Add document" }).click();
  await page.getByRole("dialog", { name: "Add a document" }).getByRole("button", { name: /Smith Deposition\.pdf/ }).click();
  const docText = page.locator(".ws-doc-scroll .pdf-text-layer").first();
  await expect(docText.locator("span").first()).toBeAttached({ timeout: 20_000 });

  // Excerpt via the "Add to workspace" button.
  await selectText(page, docText.locator("span", { hasText: "Payment of the settlement sum" }));
  await page.getByRole("button", { name: "Add to workspace" }).click();
  const card = page.locator(".ws-excerpt", { hasText: "Payment of the settlement sum" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Smith Deposition, p. 1" })).toBeVisible();
  // The passage is marked in the document.
  await expect(page.locator(".ws-excerpt-mark").first()).toBeAttached();

  // Excerpt by dragging the selection onto the canvas.
  await selectText(page, docText.locator("span", { hasText: "keep the terms of this settlement" }));
  await page.locator(".ws-sel-hint").dragTo(page.getByRole("region", { name: "Workspace canvas" }), { targetPosition: { x: 420, y: 420 } });
  await expect(page.locator(".ws-excerpt", { hasText: "keep the terms" })).toBeVisible();

  // Citation jumps back to the passage.
  await card.getByRole("button", { name: "Smith Deposition, p. 1" }).click();
  await expect(page.locator(".ws-flash").first()).toBeAttached();

  // Note, issue group and a connection.
  await page.getByRole("button", { name: "Note" }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("Contradicts the invoice");
  await page.getByRole("button", { name: "Issue group" }).click();
  await page.getByRole("textbox", { name: "Issue title" }).fill("Payment terms");
  await page.getByRole("button", { name: "Connect" }).click();
  await card.locator("blockquote").click();
  await page.locator(".ws-note").click({ position: { x: 20, y: 5 } });
  await expect(page.locator(".ws-link")).toHaveCount(1);

  // Search across documents and add a result.
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("textbox", { name: "Search all documents" }).fill("Beta Corp");
  await expect(page.getByText(/2 results in 1 document/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add result from page 2 to workspace" }).click();
  await expect(page.locator(".ws-excerpt", { hasText: "Beta Corp" })).toBeVisible();

  // Outline lists the points.
  await page.getByRole("button", { name: "Outline" }).click();
  const outlinePanel = page.getByRole("complementary", { name: "Outline" });
  await expect(outlinePanel).toContainText("Payment terms");
  await expect(outlinePanel).toContainText("Smith Deposition, p. 2");

  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator(".ws-excerpt")).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue("Contradicts the invoice");
  await expect(page.locator(".ws-link")).toHaveCount(1);

  // Export opens the new Word outline from the user's files.
  await page.getByRole("button", { name: "Export to Word" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Untitled workspace - outline.docx" })).toBeVisible({ timeout: 30_000 });
  const doc = page.locator(".doc-flow");
  await expect(doc).toContainText("Payment terms");
  await expect(doc).toContainText("Payment of the settlement sum");
  await expect(doc).toContainText("— Smith Deposition, p. 1");
});

test("highlights, comments, collapse, ink, PDF export and live sync", async ({ page, context }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "Smith Deposition.pdf", mimeType: "application/pdf", buffer: await samplePdf() });
  await expect(page.getByRole("button", { name: /^Smith Deposition\.pdf,/ })).toBeVisible();
  await page.getByRole("button", { name: "Case workspace" }).click();
  await page.getByRole("button", { name: "Add document" }).click();
  await page.getByRole("dialog", { name: "Add a document" }).getByRole("button", { name: /Smith Deposition\.pdf/ }).click();
  const docText = page.locator(".ws-doc-scroll .pdf-text-layer").first();
  await expect(docText.locator("span").first()).toBeAttached({ timeout: 20_000 });

  // Highlight.
  await selectText(page, docText.locator("span", { hasText: "Payment of the settlement sum" }));
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(page.locator(".ws-highlight-mark")).toHaveCount(1);

  // Comment with text.
  await selectText(page, docText.locator("span", { hasText: "keep the terms of this settlement" }));
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByRole("textbox", { name: "Comment text" }).fill("Is confidentiality enforceable?");
  await page.getByRole("dialog", { name: "Comment" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Comment: Is confidentiality enforceable?" })).toBeVisible();

  // Overview strip shows both.
  await expect(page.locator(".ws-ov-highlight")).toHaveCount(1);
  await expect(page.locator(".ws-ov-comment")).toHaveCount(1);

  // Collapse page 1 and expand it again.
  await page.locator(".ws-page[data-page='0']").hover();
  await page.getByRole("button", { name: "Collapse page 1" }).click();
  await expect(page.getByRole("button", { name: /Page 1 collapsed/ })).toBeVisible();
  await page.getByRole("button", { name: /Page 1 collapsed/ }).click();
  await expect(page.locator(".ws-page[data-page='0']")).toBeVisible();

  // Ink on the canvas.
  await page.getByRole("button", { name: "Pen" }).click();
  const canvas = page.getByRole("region", { name: "Workspace canvas" });
  const cb = (await canvas.boundingBox())!;
  await page.mouse.move(cb.x + 200, cb.y + 200);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cb.x + 200 + i * 15, cb.y + 200 + (i % 2) * 20);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ws-ink-stroke")).toHaveCount(1);

  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 20_000 });

  // Live sync: a second tab sees changes saved by the first.
  const url = page.url();
  const other = await context.newPage();
  await other.setViewportSize({ width: 1500, height: 950 });
  await other.goto(url);
  await expect(other.locator(".ws-ink-stroke")).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole("button", { name: "Note" }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("Synced note");
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 20_000 });
  await expect(other.getByRole("textbox", { name: "Note" })).toHaveValue("Synced note", { timeout: 20_000 });
  await other.close();

  // PDF export lands in the user's files.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  expect((await download).suggestedFilename()).toBe("Untitled workspace - outline.pdf");
  await page.getByRole("link", { name: "Back to files" }).click();
  await expect(page.getByRole("button", { name: /^Untitled workspace - outline\.pdf,/ })).toBeVisible();
});
