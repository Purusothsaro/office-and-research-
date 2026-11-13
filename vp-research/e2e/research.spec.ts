import { PDFArray, PDFDocument, PDFName, rgb, StandardFonts } from "@cantoo/pdf-lib";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "./fixtures/test";
import { samplePdf } from "./fixtures/make-pdf";

const H = { "X-Octo-Client": "web" };

test.describe.configure({ timeout: 180_000 });

async function selectText(page: Page, span: ReturnType<Page["locator"]>) {
  // The text layer is rebuilt when pages re-render (zoom, resize), so retry until it's stable.
  let b: { x: number; y: number; width: number; height: number } | null = null;
  for (let i = 0; i < 5 && !b; i++) {
    try {
      await span.first().scrollIntoViewIfNeeded({ timeout: 5000 });
      await page.waitForTimeout(150);
      b = await span.first().boundingBox();
    } catch {
      await page.waitForTimeout(300);
    }
  }
  if (!b) throw new Error("Text not found");
  await page.mouse.move(b.x + 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function createProject(page: Page, name = "Acme v Beta") {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "New research project" });
  await dialog.getByLabel("Project name").fill(name);
  await dialog.getByLabel("Case name").fill("Acme Holdings Ltd v Beta Corp");
  await dialog.getByLabel("Case reference").fill("CL-2026-000123");
  await dialog.getByLabel("Court").fill("Commercial Court");
  await dialog.getByLabel("Jurisdiction").fill("England and Wales");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function importFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.getByTestId("import-input").setInputFiles(files);
}

const docRow = (page: Page, name: string) => page.getByRole("list", { name: "Documents" }).locator("li", { hasText: name });
const textLayer = (page: Page) => page.locator(".rs-page .pdf-text-layer").first();
const card = (page: Page, text: string) => page.locator(".rs-card", { hasText: text });

async function waitSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^ *Saved$/ }).first()).toBeVisible({ timeout: 20_000 });
}

test("reads, excerpts, connects, annotates and searches across documents", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createProject(page);

  await importFiles(page, [
    { name: "Settlement Agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf() },
    { name: "Witness notes.txt", mimeType: "text/plain", buffer: Buffer.from("Statement of J. Roe\n\nI was told the settlement would be paid in March.\n\nThe gate was locked at 9 pm.") },
    { name: "Chronology.md", mimeType: "text/markdown", buffer: Buffer.from("# Chronology\n\n- 1 March: settlement signed\n- 9 April: **payment** missed") },
  ]);
  await expect(docRow(page, "Settlement Agreement.pdf")).toContainText("2 pages · Native text", { timeout: 30_000 });
  await expect(docRow(page, "Witness notes.txt")).toContainText("Converted", { timeout: 30_000 });
  await expect(docRow(page, "Chronology.md")).toContainText("Converted", { timeout: 30_000 });

  // Page navigation and zoom in the viewer.
  await expect(textLayer(page).locator("span").first()).toBeAttached({ timeout: 20_000 });
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await page.getByRole("button", { name: "Previous page" }).click();
  await page.getByRole("button", { name: "Zoom in" }).first().click();
  await page.getByRole("button", { name: "Fit to width" }).click();

  // Excerpt from selected text: the card cites document and page.
  await selectText(page, textLayer(page).locator("span", { hasText: "Payment of the settlement sum" }));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  const first = card(page, "Payment of the settlement sum");
  await expect(first).toBeVisible();
  await expect(first.getByRole("button", { name: "Open source: Settlement Agreement, p. 1" })).toBeVisible();
  await expect(page.locator(".rs-mark-excerpt").first()).toBeAttached();

  // Excerpt by dragging the selection onto the workspace.
  await selectText(page, textLayer(page).locator("span", { hasText: "keep the terms of this settlement" }));
  await page.locator(".rs-chip-grip").dragTo(page.getByRole("application", { name: "Research workspace canvas" }), { targetPosition: { x: 520, y: 420 } });
  const second = card(page, "keep the terms");
  await expect(second).toBeVisible();

  // The source opens from the card and flashes.
  await page.getByRole("button", { name: "Open source: Settlement Agreement, p. 1" }).first().click();
  await expect(page.locator(".rs-flash").first()).toBeAttached();

  // Connect the two excerpts as "contradicts" and label the connection.
  await first.locator("blockquote").click();
  await second.locator("blockquote").click({ modifiers: ["Shift"] });
  await page.getByRole("combobox", { name: "Connect selected cards" }).selectOption("contradicts");
  const label = page.getByRole("button", { name: /^Connection: Contradicts/ });
  await expect(label).toBeVisible();
  await label.click();
  await page.getByRole("textbox", { name: "Connection label" }).fill("Timing of payment");
  await page.getByRole("textbox", { name: "Connection label" }).press("Enter");
  await expect(page.getByRole("button", { name: "Connection: Contradicts — Timing of payment" })).toBeVisible();

  // Moving a card keeps the connector attached.
  const line = page.locator("line.rs-connector").first();
  const before = await line.getAttribute("x2");
  const box = (await second.locator("blockquote").boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y - 120, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await line.getAttribute("x2")) !== before || (await line.getAttribute("x1")) !== null).toBe(true);
  const after = await line.evaluate((l) => [l.getAttribute("x1"), l.getAttribute("y1"), l.getAttribute("x2"), l.getAttribute("y2")].map(Number));
  const cardBox = await second.evaluate((el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
  const touches = (x: number, y: number) => x >= cardBox.x - 1 && x <= cardBox.x + cardBox.w + 1 && y >= cardBox.y - 1 && y <= cardBox.y + cardBox.h + 1 && (Math.abs(x - cardBox.x) < 2 || Math.abs(x - cardBox.x - cardBox.w) < 2 || Math.abs(y - cardBox.y) < 2 || Math.abs(y - cardBox.y - cardBox.h) < 2);
  expect(touches(after[0]!, after[1]!) || touches(after[2]!, after[3]!)).toBe(true);

  // Resize a card.
  const widthBefore = await first.evaluate((el: HTMLElement) => el.offsetWidth);
  const handle = (await first.locator(".rs-resize").boundingBox())!;
  await page.mouse.move(handle.x + 8, handle.y + 8);
  await page.mouse.down();
  await page.mouse.move(handle.x + 108, handle.y + 48, { steps: 6 });
  await page.mouse.up();
  expect(await first.evaluate((el: HTMLElement) => el.offsetWidth)).toBeGreaterThan(widthBefore + 50);

  // A note and an issue group around the excerpts.
  await page.getByRole("application", { name: "Research workspace canvas" }).click({ position: { x: 30, y: 80 } });
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note text" }).fill("Ask the client when payment was due");
  await first.locator("blockquote").click();
  await second.locator("blockquote").click({ modifiers: ["Shift"] });
  await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Group" }).click();
  await page.getByRole("textbox", { name: "Group title" }).fill("Was payment due?");

  // Tags.
  await first.locator("blockquote").click();
  await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Tags" }).click();
  await page.getByRole("textbox", { name: "Add tag" }).fill("Key term");
  await page.getByRole("textbox", { name: "Add tag" }).press("Enter");
  await page.getByRole("button", { name: "Save tags" }).click();
  await expect(first).toContainText("Key term");

  // Highlight and comment in the document; both appear in the annotation list.
  await selectText(page, textLayer(page).locator("span", { hasText: "Acme Holdings Ltd and Beta Corp" }));
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(page.locator(".rs-mark-highlight").first()).toBeAttached();
  await selectText(page, textLayer(page).locator("span", { hasText: "SETTLEMENT AGREEMENT" }));
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Comment" }).click();
  await page.getByRole("dialog", { name: "Comment" }).getByRole("textbox", { name: "Comment text" }).fill("Check the signed copy");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Margin note: Check the signed copy" })).toBeVisible();
  await page.getByRole("tab", { name: "Annotations" }).click();
  const marks = page.getByRole("list", { name: "Annotations" });
  await expect(marks).toContainText("Check the signed copy");
  await expect(marks).toContainText("Acme Holdings Ltd and Beta Corp");

  // Search across all documents, with source and page.
  await page.getByRole("tab", { name: "Search" }).click();
  await page.getByRole("textbox", { name: "Search all documents" }).fill("settlement");
  await expect(page.getByText(/results? in 3 documents/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("region", { name: "Results in Witness notes.txt" }).getByRole("button", { name: /p\. 1/ }).first().click();
  await expect(page.getByRole("region", { name: "Document: Witness notes.txt" })).toBeVisible();
  await expect(page.locator(".rs-mark-hit").first()).toBeAttached();

  // Undo and redo.
  await page.getByRole("application", { name: "Research workspace canvas" }).click({ position: { x: 30, y: 80 } });
  const cards = page.locator(".rs-card");
  const count = await cards.count();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await expect(cards).toHaveCount(count + 1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cards).toHaveCount(count);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(cards).toHaveCount(count + 1);

  // Everything is there after a reload.
  await waitSaved(page);
  await page.reload();
  await expect(cards).toHaveCount(count + 1, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Connection: Contradicts — Timing of payment" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Group title" })).toHaveValue("Was payment due?");
  // The reader reopens the last document read (Witness notes); the highlight is in the agreement.
  await expect(page.getByRole("tab", { name: "Witness notes.txt", selected: true })).toBeVisible();
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await expect(page.locator(".rs-mark-highlight").first()).toBeAttached({ timeout: 20_000 });
});

test("exports summaries, an annotated PDF, a snapshot and project data", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createProject(page, "Export check");
  await importFiles(page, [{ name: "Settlement Agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf() }]);
  await expect(docRow(page, "Settlement Agreement.pdf")).toContainText("Native text", { timeout: 30_000 });
  await expect(textLayer(page).locator("span").first()).toBeAttached({ timeout: 20_000 });
  await selectText(page, textLayer(page).locator("span", { hasText: "Payment of the settlement sum" }));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  await selectText(page, textLayer(page).locator("span", { hasText: "Acme Holdings Ltd and Beta Corp" }));
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Highlight", exact: true }).click();
  await waitSaved(page);

  // Summary to Word and PDF.
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Research summary" }).click();
  const summary = page.getByRole("dialog", { name: "Research summary" });
  await expect(summary.getByLabel("Summary preview")).toContainText("Settlement Agreement, p. 1");
  const [docx] = await Promise.all([page.waitForEvent("download"), summary.getByRole("button", { name: "Download Word" }).click()]);
  const zip = await JSZip.loadAsync(await readFile((await docx.path())!));
  const xml = await zip.file("word/document.xml")!.async("string");
  expect(xml).toContain("Payment of the settlement sum");
  expect(xml).toContain("Settlement Agreement, p. 1");
  expect(xml).toContain("Commercial Court");
  expect(xml).toContain("not verified legal conclusions");
  const [pdf] = await Promise.all([page.waitForEvent("download"), summary.getByRole("button", { name: "Download PDF" }).click()]);
  const summaryPdf = await PDFDocument.load(await readFile((await pdf.path())!));
  expect(summaryPdf.getTitle()).toContain("research summary");
  await summary.getByRole("button", { name: "Close" }).click();

  // Annotated PDF, snapshot and project data.
  await page.getByRole("button", { name: "Share" }).click();
  const exp = page.getByRole("dialog", { name: "Export" });
  const [annotated] = await Promise.all([page.waitForEvent("download"), exp.getByRole("button", { name: "Download PDF" }).click()]);
  const out = await PDFDocument.load(await readFile((await annotated.path())!));
  const annots = out.getPage(0).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  expect(annots?.size()).toBeGreaterThanOrEqual(1);
  const [svg] = await Promise.all([page.waitForEvent("download"), exp.getByRole("button", { name: "SVG" }).click()]);
  expect(await readFile((await svg.path())!, "utf8")).toContain("Settlement Agreement, p. 1");
  const [json] = await Promise.all([page.waitForEvent("download"), exp.getByRole("button", { name: "Download JSON" }).click()]);
  const data = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(data).toMatchObject({ format: "octogenie-research-export", version: 1, project: { court: "Commercial Court" } });
  expect(data.sources.map((s: { citation: string }) => s.citation)).toContain("Settlement Agreement, p. 1");
});

test("manages projects and keeps them private to their owner", async ({ page, browser }) => {
  await createProject(page, "Matter one");
  const url = page.url();
  await page.getByRole("button", { name: "Back to projects" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Matter one" });
  await row.getByRole("button", { name: "Actions for Matter one" }).click();
  await page.getByRole("menuitem", { name: "Rename and edit details" }).click();
  await page.getByRole("dialog", { name: "Project details" }).getByLabel("Project name").fill("Matter renamed");
  await page.getByRole("button", { name: "Save details" }).click();
  const renamed = page.getByRole("listitem").filter({ hasText: "Matter renamed" });
  await expect(renamed).toBeVisible();
  await renamed.getByRole("button", { name: "Actions for Matter renamed" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Matter renamed (copy)" })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Matter renamed (copy)" }).getByRole("button", { name: /^Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "(copy)" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Archived" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Matter renamed (copy)" })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "(copy)" }).getByRole("button", { name: /^Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByText("No archived projects.")).toBeVisible();

  // Another account can't open the project.
  const other = await browser.newContext({ baseURL: "http://localhost:4175" });
  const res = await other.request.post("/api/auth/register", { data: { email: `other-${Date.now()}@example.com`, password: "correct horse battery" }, headers: H });
  expect(res.ok()).toBe(true);
  const p2 = await other.newPage();
  await p2.goto(url);
  await expect(p2.getByRole("alert")).toContainText("Project not found");
  await other.close();
});

test("recovers edits made while the server was unreachable", async ({ page: first }) => {
  let page = first;
  await page.setViewportSize({ width: 1500, height: 950 });
  await createProject(page, "Offline matter");
  await waitSaved(page);
  // The connection drops.
  const context = page.context();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note text" }).fill("Written offline");
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible({ timeout: 20_000 });
  // The tab is closed while the change exists only on this device; the save attempted on close fails too.
  await page.close();
  await context.setOffline(false);
  page = await context.newPage();
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/");
  await expect(page.getByText(/changes saved on this device/)).toBeVisible();
  await page.getByRole("button", { name: "Open Offline matter" }).click();
  await expect(page.getByText(/Restored changes from/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue("Written offline");
  await waitSaved(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue("Written offline", { timeout: 20_000 });
  await expect(page.getByText(/Restored changes from/)).toHaveCount(0);
});

test("re-links excerpts when a document is replaced and warns about missing passages", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await createProject(page, "Versions");
  await importFiles(page, [{ name: "Contract.pdf", mimeType: "application/pdf", buffer: await samplePdf() }]);
  await expect(docRow(page, "Contract.pdf")).toContainText("Native text", { timeout: 30_000 });
  await expect(textLayer(page).locator("span").first()).toBeAttached({ timeout: 20_000 });
  await selectText(page, textLayer(page).locator("span", { hasText: "Payment of the settlement sum" }));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  await selectText(page, textLayer(page).locator("span", { hasText: "keep the terms of this settlement" }));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  await expect(page.locator(".rs-card")).toHaveCount(2);

  // Version 2 keeps the payment clause but drops the confidentiality clause.
  const v2 = await PDFDocument.create();
  const font = await v2.embedFont(StandardFonts.Helvetica);
  const p = v2.addPage([612, 792]);
  p.drawText("SETTLEMENT AGREEMENT (AMENDED)", { x: 72, y: 700, size: 18, font });
  p.drawText("Payment of the settlement sum is due within thirty days of signing.", { x: 72, y: 650, size: 12, font, color: rgb(0, 0, 0) });
  await docRow(page, "Contract.pdf").getByRole("button", { name: "Actions for Contract.pdf" }).click();
  await page.getByRole("menuitem", { name: "Replace with new version…" }).click();
  await page.getByTestId("replace-input").setInputFiles({ name: "Contract v2.pdf", mimeType: "application/pdf", buffer: Buffer.from(await v2.save()) });
  await expect(page.getByText(/1 unchanged, 0 moved, 1 not found/)).toBeVisible({ timeout: 30_000 });
  // The broken excerpt shows a warning and still opens the old version.
  const broken = card(page, "keep the terms");
  await expect(broken.getByLabel(/Not found in the new version/)).toBeVisible();
  await broken.getByRole("button", { name: /Open source/ }).click();
  await expect(page.getByText(/Showing an earlier version/)).toBeVisible();
});

test("recognises text in a scanned PDF with OCR in the browser", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1500, height: 950 });
  // A "scan": an image of text with no text layer.
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1700;
    c.height = 2200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#111";
    ctx.font = "56px Arial";
    ctx.fillText("EXHIBIT 7", 160, 260);
    ctx.font = "44px Georgia";
    ctx.fillText("The invoice was received on 3 May.", 160, 400);
    ctx.fillText("Payment remained outstanding.", 160, 480);
    return c.toDataURL("image/png").split(",")[1]!;
  });
  const scan = await PDFDocument.create();
  const image = await scan.embedPng(Buffer.from(png, "base64"));
  scan.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  await createProject(page, "Scans");
  await importFiles(page, [{ name: "Exhibit 7 scan.pdf", mimeType: "application/pdf", buffer: Buffer.from(await scan.save()) }]);
  await expect(docRow(page, "Exhibit 7 scan.pdf")).toContainText("Scanned — no text yet", { timeout: 30_000 });
  await docRow(page, "Exhibit 7 scan.pdf").getByRole("button", { name: "Actions for Exhibit 7 scan.pdf" }).click();
  await page.getByRole("menuitem", { name: "Recognise text (OCR)" }).click();
  await expect(docRow(page, "Exhibit 7 scan.pdf")).toContainText("OCR text", { timeout: 180_000 });
  await page.getByRole("tab", { name: "Search" }).click();
  await page.getByRole("textbox", { name: "Search all documents" }).fill("invoice was received");
  await expect(page.getByText(/1 result in 1 document/)).toBeVisible({ timeout: 20_000 });
  // OCR text is selectable and becomes an excerpt marked as OCR.
  await page.getByRole("button", { name: "Add as excerpt" }).click();
  await expect(card(page, "invoice was received")).toContainText("OCR");
});

test("stays responsive with a large document and hundreds of cards", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const big = await PDFDocument.create();
  const font = await big.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 300; i++) big.addPage([612, 792]).drawText(`Transcript page ${i}. The witness answered question ${i * 7}.`, { x: 72, y: 700, size: 12, font });
  await createProject(page, "Large");
  await importFiles(page, [{ name: "Transcript.pdf", mimeType: "application/pdf", buffer: Buffer.from(await big.save()) }]);
  await expect(docRow(page, "Transcript.pdf")).toContainText("300 pages", { timeout: 90_000 });
  await page.getByLabel("Page number").fill("250");
  await page.getByLabel("Page number").press("Enter");
  await expect(page.locator(".rs-page[data-page='249'] .pdf-text-layer span").first()).toBeAttached({ timeout: 20_000 });
  // Only pages near the viewport have rendered bitmaps.
  const rendered = await page.locator(".rs-page canvas").evaluateAll((cs) => cs.filter((c) => (c as HTMLCanvasElement).width > 0).length);
  expect(rendered).toBeLessThan(20);

  // 400 cards added through the API, then opened.
  const projectId = page.url().split("/p/")[1]!;
  await page.waitForTimeout(1500);
  // The app may save at the same moment; retry the compare-and-set write.
  let ok = false;
  for (let attempt = 0; attempt < 6 && !ok; attempt++) {
    const current = await page.request.get(`/api/projects/${projectId}/workspace`);
    const ws = await current.json();
    const rev = Number(current.headers()["x-revision"]);
    for (let i = 0; i < 400; i++) ws.cards.push({ id: `n${i}`, type: "note", x: (i % 20) * 260, y: Math.floor(i / 20) * 170, w: 220, h: 130, color: "#fef3c7", tags: [], text: `Card ${i}`, createdAt: 0, updatedAt: 0 });
    for (let i = 1; i < 400; i++) ws.connectors.push({ id: `c${i}`, from: `n${i - 1}`, to: `n${i}`, relation: "related" });
    const put = await page.request.put(`/api/projects/${projectId}/workspace?baseRevision=${rev}`, { data: Buffer.from(JSON.stringify(ws)), headers: { ...H, "Content-Type": "application/octet-stream" } });
    ok = put.ok();
    if (!ok) await page.waitForTimeout(700);
  }
  expect(ok).toBe(true);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Note text" }).first()).toBeVisible({ timeout: 30_000 });
  // Off-screen cards aren't in the DOM.
  expect(await page.locator(".rs-card").count()).toBeLessThan(200);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Fit workspace" }).click();
  await expect(page.locator(".rs-card").first()).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(5000);
  await page.getByRole("textbox", { name: "Filter workspace cards" }).fill("Card 399");
  await expect(page.getByText("1 match")).toBeVisible();
});

test("adapts the layout to tablets and phones", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1180 });
  await createProject(page, "Tablet");
  await expect(page.getByRole("button", { name: "Documents panel" })).toBeVisible();
  await page.getByRole("button", { name: "Documents panel" }).click();
  await expect(page.getByRole("button", { name: "Import documents" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tab", { name: "Workspace" })).toBeVisible();
  await page.getByRole("tab", { name: "Workspace" }).click();
  await expect(page.getByRole("application", { name: "Research workspace canvas" })).toBeVisible();
});
