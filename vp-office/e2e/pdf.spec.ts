import { PDFArray, PDFDict, PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { expect, test, type Page } from "./fixtures/test";
import { readFile } from "node:fs/promises";
import { samplePdf } from "./fixtures/make-pdf";

async function openSample(page: Page) {
  page.on("dialog", (d) => void d.accept());
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "Settlement.pdf", mimeType: "application/pdf", buffer: await samplePdf() });
  await page.getByRole("button", { name: /^Settlement\.pdf,/ }).click();
  const first = page.locator(".pdf-page").first();
  await expect(first.locator(".pdf-text-layer span").first()).toBeAttached({ timeout: 15_000 });
  return first;
}

const panel = (page: Page) => page.getByRole("complementary", { name: "Comments and annotations" });

test("annotates, fills forms, reorganises pages, saves and reopens a PDF", async ({ page }) => {
  const first = await openSample(page);
  await expect(page.getByRole("note")).toContainText("Edit the PDF's text");
  const box = (await first.boundingBox())!;

  // Highlight by selecting text.
  await page.getByRole("radio", { name: /Highlight/ }).click();
  const payment = first.locator(".pdf-text-layer span", { hasText: "Payment of the settlement" });
  const pb = (await payment.boundingBox())!;
  await page.mouse.move(pb.x + 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width - 2, pb.y + pb.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(panel(page).locator(".pdf-comment-quote")).toContainText("Payment of the settlement");

  // Sticky note with a comment.
  await page.getByRole("radio", { name: /Note/ }).click();
  await page.mouse.click(box.x + box.width - 80, box.y + 120);
  const comment = panel(page).getByRole("textbox", { name: /Comment on note/ });
  await comment.fill("Confirm amount with client");
  await comment.blur();

  // Freehand drawing.
  await page.getByRole("radio", { name: /Draw/ }).click();
  await page.mouse.move(box.x + 120, box.y + 560);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 120 + i * 12, box.y + 560 + (i % 2) * 14);
  await page.mouse.up();

  // Text box.
  await page.getByRole("radio", { name: /Text box/ }).click();
  await page.mouse.click(box.x + 360, box.y + 640);
  await page.getByRole("textbox", { name: "Text box" }).fill("Reviewed by counsel");
  await page.getByRole("radio", { name: /Select/ }).click();

  // Drawn signature.
  await page.getByRole("radio", { name: /Signature/ }).click();
  const pad = page.getByRole("img", { name: "Signature pad" }).or(page.getByLabel("Signature pad"));
  const sb = (await pad.boundingBox())!;
  await page.mouse.move(sb.x + 30, sb.y + 90);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(sb.x + 30 + i * 20, sb.y + 90 + Math.sin(i) * 30);
  await page.mouse.up();
  await page.getByRole("button", { name: "Use signature" }).click();
  await page.mouse.click(box.x + 100, box.y + 700);
  await page.getByRole("radio", { name: /Select/ }).click();
  await expect(panel(page).getByRole("heading")).toHaveText("Annotations (5)");

  // Undo and redo the signature.
  await page.keyboard.press("Control+z");
  await expect(panel(page).getByRole("heading")).toHaveText("Annotations (4)");
  await page.keyboard.press("Control+y");
  await expect(panel(page).getByRole("heading")).toHaveText("Annotations (5)");

  // Form field.
  await page.getByRole("textbox", { name: "signatory" }).fill("Jane Doe");

  // Rotate page 2 and move it first.
  await page.getByRole("button", { name: "Rotate page 2 right" }).click();
  await page.getByRole("button", { name: "Move page 2 up" }).click();
  await expect(page.locator(".pdf-page").first()).toHaveAttribute("data-page-source", "1");

  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.locator(".pdf-page").first().locator(".pdf-text-layer span").first()).toBeAttached({ timeout: 15_000 });
  await expect(panel(page).getByRole("heading")).toHaveText("Annotations (5)");
  await expect(panel(page).getByRole("textbox", { name: /Comment on note/ })).toHaveValue("Confirm amount with client");
  // The form page is now second; pages render as they scroll into view.
  await page.locator(".pdf-page").nth(1).scrollIntoViewIfNeeded();
  await expect(page.getByRole("textbox", { name: "signatory" })).toHaveValue("Jane Doe");
  await expect(page.locator(".pdf-page").first().locator(".pdf-text-layer")).toContainText("SCHEDULE 1");

  // The downloaded file has real annotations other viewers can show.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const bytes = await readFile((await (await downloadPromise).path())!);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(2);
  expect(doc.getPage(0).getRotation().angle).toBe(90);
  const subtypes = doc.getPages().flatMap((p) =>
    (p.node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.asArray() ?? []).map((r) => doc.context.lookup(r, PDFDict).get(PDFName.of("Subtype"))?.toString()),
  );
  expect(subtypes.filter((s) => s !== "/Widget").sort()).toEqual(["/FreeText", "/Highlight", "/Ink", "/Stamp", "/Text"]);
  expect(doc.getForm().getTextField("signatory").getText()).toBe("Jane Doe");
});

test("searches text and deletes annotations with the keyboard", async ({ page }) => {
  const first = await openSample(page);
  await page.getByRole("textbox", { name: "Search PDF" }).fill("settlement");
  await expect(page.getByRole("search").getByText(/^1 of \d+$/)).toBeVisible();
  await expect(page.locator(".pdf-search-current").first()).toBeVisible();

  const box = (await first.boundingBox())!;
  await page.getByRole("radio", { name: /Note/ }).click();
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.getByRole("radio", { name: /Select/ }).click();
  await first.locator(".pdf-annot-note").click();
  await page.keyboard.press("Delete");
  await expect(panel(page).getByRole("heading")).toHaveText("Annotations (0)");
});

test("edits the PDF's own text and removes the original on save", async ({ page }) => {
  const first = await openSample(page);
  await page.getByRole("radio", { name: /Edit text/ }).click();
  await first.getByRole("button", { name: /Edit "Payment of the settlement sum/ }).click();
  const input = page.getByRole("textbox", { name: /Edit text: Payment/ });
  await input.fill("Payment of the settlement sum is due within sixty days of signing.");
  await input.press("Enter");
  await expect(first.locator(".pdf-edit-text")).toHaveText("Payment of the settlement sum is due within sixty days of signing.");
  await expect(page.getByRole("region", { name: "Text edits" }).or(page.getByLabel("Text edits"))).toContainText("sixty days");

  // Delete another line entirely.
  await first.getByRole("button", { name: /Edit "This is page 1/ }).click();
  await page.getByRole("textbox", { name: /Edit text: This is page 1/ }).fill("");
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  const reopened = page.locator(".pdf-page").first();
  await expect(reopened.locator(".pdf-text-layer")).toContainText("sixty days", { timeout: 15_000 });
  await expect(reopened.locator(".pdf-text-layer")).not.toContainText("thirty days");
  await expect(reopened.locator(".pdf-text-layer")).not.toContainText("This is page 1");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const bytes = new Uint8Array(await readFile((await (await downloadPromise).path())!));
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes, verbosity: 0 } as never);
  const pdf = await task.promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  const all = content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
  await task.destroy();
  expect(all).toContain("sixty days");
  expect(all).not.toContain("thirty days");
  expect(all).not.toContain("This is page 1");
  expect(all).toContain("SETTLEMENT AGREEMENT");
});
