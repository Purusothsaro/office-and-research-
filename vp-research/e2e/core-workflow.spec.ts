// Acceptance tests for the core reading workflow:
// read → select → excerpt → arrange → note → connect → back to source → reload.
import { PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib";
import { expect, test, type Page } from "./fixtures/test";
import { samplePdf } from "./fixtures/make-pdf";

type Locator = ReturnType<Page["locator"]>;

// Each test walks a whole workflow in a real browser.
test.describe.configure({ timeout: 180_000 });

/** A deposition: page 2 has an answer that wraps onto a second line. */
async function depositionPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([612, 792]);
  p1.drawText("DEPOSITION OF J. ROE", { x: 72, y: 700, size: 18, font });
  p1.drawText("Taken on 12 June at the offices of counsel.", { x: 72, y: 660, size: 12, font });
  const p2 = doc.addPage([612, 792]);
  const lines = ["Q. When did you first see the notice?", "A. I never received any notice from the landlord", "before the hearing on 3 May.", "Q. Did anyone call you about the payment?", "A. The broker telephoned in early April."];
  lines.forEach((t, i) => p2.drawText(t, { x: 72, y: 700 - i * 20, size: 12, font, color: rgb(0, 0, 0) }));
  return Buffer.from(await doc.save());
}

const textLayer = (page: Page) => page.locator(".rs-page .pdf-text-layer");
const span = (page: Page, text: string) => textLayer(page).locator("span", { hasText: text }).first();
const card = (page: Page, text: string) => page.locator(".rs-card", { hasText: text });
const canvas = (page: Page) => page.getByRole("application", { name: "Research workspace canvas" });

/** Drags from the start of one text span to the end of another (same or later line). */
type Box = { x: number; y: number; width: number; height: number };
async function selectRange(page: Page, from: Locator, to: Locator = from) {
  let a: Box | null = null;
  let b: Box | null = null;
  // The text layer is rebuilt when pages re-render, so retry until it's stable.
  // Wait until the text stops moving (pages re-render while a document opens or scrolls).
  for (let i = 0; i < 15; i++) {
    try {
      await from.scrollIntoViewIfNeeded({ timeout: 5000 });
      const a0 = await from.boundingBox();
      await page.waitForTimeout(250);
      a = await from.boundingBox();
      b = await to.boundingBox();
      if (a && b && a0 && Math.abs(a0.x - a.x) < 0.5 && Math.abs(a0.y - a.y) < 0.5) break;
    } catch {
      await page.waitForTimeout(300);
    }
  }
  if (!a || !b) throw new Error("Text not found");
  // Pages can re-render mid-drag under load; check the selection ends where intended and retry if not.
  const want = ((await to.textContent()) ?? "").trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    a = (await from.boundingBox()) ?? a;
    b = (await to.boundingBox()) ?? b;
    await page.mouse.move(a!.x + 1, a!.y + a!.height / 2);
    await page.mouse.down();
    await page.mouse.move(b!.x + b!.width - 1, b!.y + b!.height / 2, { steps: 10 });
    await page.mouse.up();
    const got = await page.evaluate(() => (window.getSelection()?.toString() ?? "").replace(/s+/g, " ").trim());
    if (got.endsWith(want.slice(-6))) return;
    await page.waitForTimeout(300);
  }
}

async function newProject(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("dialog", { name: "New research project" }).getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().split("/p/")[1]!;
}

async function importDocs(page: Page) {
  await page.getByTestId("import-input").setInputFiles([
    { name: "Settlement Agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf() },
    { name: "Deposition of J. Roe.pdf", mimeType: "application/pdf", buffer: await depositionPdf() },
  ]);
  const docs = page.getByRole("list", { name: "Documents" });
  await expect(docs.locator("li", { hasText: "Settlement Agreement.pdf" })).toContainText("Native text", { timeout: 30_000 });
  await expect(docs.locator("li", { hasText: "Deposition of J. Roe.pdf" })).toContainText("Native text", { timeout: 30_000 });
}

async function savedWorkspace(page: Page, projectId: string) {
  // Edits are written after a short pause; let it pass before checking the save state.
  await page.waitForTimeout(1600);
  await expect(page.getByRole("status").filter({ hasText: /^ *Saved$/ }).first()).toBeVisible({ timeout: 20_000 });
  return (await page.request.get(`/api/projects/${projectId}/workspace`)).json();
}

const box = (el: Locator) => el.evaluate((e: HTMLElement) => ({ x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight }));

/** True if (x, y) lies on the border of the box (within tolerance). */
function onEdge(p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }, tol = 2) {
  const inside = p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
  const edge = Math.abs(p.x - b.x) < tol || Math.abs(p.x - b.x - b.w) < tol || Math.abs(p.y - b.y) < tol || Math.abs(p.y - b.y - b.h) < tol;
  return inside && edge;
}

/** End points of every connector line, in canvas units. */
const connectorLines = (page: Page) => page.locator("line.rs-connector").evaluateAll((ls) => ls.map((l) => ({ a: { x: Number(l.getAttribute("x1")), y: Number(l.getAttribute("y1")) }, b: { x: Number(l.getAttribute("x2")), y: Number(l.getAttribute("y2")) } })));

async function dragBy(page: Page, handle: Locator, dx: number, dy: number) {
  const b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 8);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + 8 + dy, { steps: 12 });
  await page.mouse.up();
}

test("the core workflow: excerpt, arrange, note, connect, return to source, reload", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const projectId = await newProject(page, "Roe v Landlord");
  await importDocs(page);

  // 1–3. Read the agreement, select a sentence, create an excerpt.
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await expect(span(page, "Payment of the settlement sum")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "Payment of the settlement sum"));
  await expect(page.getByRole("slider", { name: "Selection end" })).toBeVisible();
  await page.getByRole("button", { name: "Add excerpt" }).click();
  const e1 = card(page, "Payment of the settlement sum");
  await expect(e1.locator("blockquote")).toHaveText("“Payment of the settlement sum is due within thirty days of signing.”");
  await expect(e1.getByRole("button", { name: "Open source: Settlement Agreement, p. 1" })).toBeVisible();

  // A passage across two lines of a second document, dragged onto the workspace.
  await page.getByRole("tab", { name: "Deposition of J. Roe.pdf" }).click();
  await page.getByLabel("Page number").fill("2");
  await page.getByLabel("Page number").press("Enter");
  await expect(span(page, "I never received any notice")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "I never received any notice"), span(page, "before the hearing on 3 May."));
  await page.locator(".rs-chip-grip").dragTo(canvas(page), { targetPosition: { x: 560, y: 520 } });
  const e2 = card(page, "never received any notice");
  await expect(e2.locator("blockquote")).toHaveText("“A. I never received any notice from the landlord before the hearing on 3 May.”");
  await expect(e2.getByRole("button", { name: "Open source: Deposition of J. Roe, p. 2" })).toBeVisible();

  // The stored source reference has document, version, page, text, offsets, rectangles and ids.
  let ws = await savedWorkspace(page, projectId);
  const dep = ws.documents.find((d: { name: string }) => d.name === "Deposition of J. Roe.pdf");
  const c2 = ws.cards.find((c: { text: string }) => c.text.includes("never received"));
  const s2 = ws.sources[c2.sourceId];
  expect(s2).toMatchObject({ documentId: dep.id, viewFileId: dep.viewFileId, viewRevision: 1, sourceRevision: 1, page: 1, quote: "A. I never received any notice from the landlord before the hearing on 3 May.", status: "ok", owner: { kind: "excerpt", id: c2.id } });
  expect(s2.end - s2.start).toBeGreaterThan(70);
  expect(s2.rects).toHaveLength(2);

  // 4. Move the second excerpt beside the first; the saved position follows.
  const zoom = ws.view.zoom;
  const before = { x: c2.x, y: c2.y };
  const b1 = await box(e1);
  const b2 = await box(e2);
  const dx = (b1.x + b1.w + 40 - b2.x) * zoom;
  const dy = (b1.y - b2.y) * zoom;
  await dragBy(page, e2.locator("blockquote"), dx, dy);
  ws = await savedWorkspace(page, projectId);
  const moved = ws.cards.find((c: { id: string }) => c.id === c2.id);
  expect(Math.abs(moved.x - (before.x + dx / zoom))).toBeLessThan(3);
  expect(Math.abs(moved.y - (before.y + dy / zoom))).toBeLessThan(3);

  // 5. A note explaining the relationship.
  await canvas(page).click({ position: { x: 40, y: 80 } });
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note text" }).fill("Payment fell due before Roe says he got notice");

  // 6. Connect the excerpts to each other and the note to the deposition excerpt.
  await e1.locator("blockquote").click();
  await e2.locator("blockquote").click({ modifiers: ["Shift"] });
  await page.getByRole("combobox", { name: "Connect selected cards" }).selectOption("contradicts");
  const noteCard = page.locator(".rs-card[aria-label='Note']");
  await noteCard.locator(".h-5").first().click();
  await e2.locator("blockquote").click({ modifiers: ["Shift"] });
  await page.getByRole("combobox", { name: "Connect selected cards" }).selectOption("references");
  await expect(page.locator("line.rs-connector")).toHaveCount(2);

  // Connectors stay attached when either end moves or is resized.
  const check = async () => {
    const lines = await connectorLines(page);
    const boxes = await Promise.all([box(e1), box(e2), box(noteCard)]);
    for (const l of lines) {
      expect(boxes.some((b) => onEdge(l.a, b))).toBe(true);
      expect(boxes.some((b) => onEdge(l.b, b))).toBe(true);
    }
  };
  await check();
  await dragBy(page, e1.locator("blockquote"), -60, 90);
  await check();
  await dragBy(page, noteCard.locator(".h-5").first(), 120, -40);
  await check();
  const handle = (await e2.locator(".rs-resize").boundingBox())!;
  await page.mouse.move(handle.x + 8, handle.y + 8);
  await page.mouse.down();
  await page.mouse.move(handle.x + 90, handle.y + 70, { steps: 6 });
  await page.mouse.up();
  await check();

  // 7. Select an excerpt and return to its exact source.
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await e2.getByRole("button", { name: "Open source: Deposition of J. Roe, p. 2" }).click();
  await expect(page.getByRole("tab", { name: "Deposition of J. Roe.pdf", selected: true })).toBeVisible();
  await expect(page.locator(".rs-page[data-page='1'] .rs-flash")).toHaveCount(2);
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  // …and from the source mark back to the excerpt on the workspace.
  await canvas(page).click({ position: { x: 30, y: 80 } });
  const mark = (await page.locator(".rs-page[data-page='1'] .rs-mark-excerpt").first().boundingBox())!;
  await page.mouse.click(mark.x + mark.width / 2, mark.y + mark.height / 2);
  await expect(e2).toHaveAttribute("data-selected", "true");
  await expect(page.locator(".rs-page[data-page='1'] .rs-mark-excerpt[data-active='true']").first()).toBeAttached();

  // 8. Reload: the same workspace, viewport and reading position come back.
  await page.getByRole("button", { name: "Zoom out" }).last().click();
  const zoomLabel = await page.getByRole("toolbar", { name: "Workspace tools" }).getByText(/^\d+%$/).textContent();
  ws = await savedWorkspace(page, projectId);
  const positions = (await page.locator(".rs-card").evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.cardId, (e as HTMLElement).style.left, (e as HTMLElement).style.top]))).sort();
  await page.waitForTimeout(1200);
  await savedWorkspace(page, projectId);
  await page.reload();
  await expect(page.locator(".rs-card")).toHaveCount(3, { timeout: 30_000 });
  expect((await page.locator(".rs-card").evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.cardId, (e as HTMLElement).style.left, (e as HTMLElement).style.top]))).sort()).toEqual(positions);
  await expect(page.locator("line.rs-connector")).toHaveCount(2);
  await expect(page.getByRole("toolbar", { name: "Workspace tools" }).getByText(/^\d+%$/)).toHaveText(zoomLabel!);
  await expect(page.getByRole("tab", { name: "Deposition of J. Roe.pdf", selected: true })).toBeVisible();
  await expect(page.getByLabel("Page number")).toHaveValue("2", { timeout: 20_000 });
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue("Payment fell due before Roe says he got notice");
});

test("search results open the right document and page", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await newProject(page, "Search nav");
  await importDocs(page);
  await page.getByRole("tab", { name: "Search" }).click();
  await page.getByRole("textbox", { name: "Search all documents" }).fill("broker telephoned");
  await expect(page.getByText(/1 result in 1 document/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("region", { name: "Results in Deposition of J. Roe.pdf" }).getByRole("button", { name: /p\. 2/ }).click();
  await expect(page.getByRole("tab", { name: "Deposition of J. Roe.pdf", selected: true })).toBeVisible();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await expect(page.locator(".rs-page[data-page='1'] .rs-flash").first()).toBeAttached();
  await expect(page.locator(".rs-page[data-page='1'] .rs-mark-hit").first()).toBeAttached();
});

test("cards land where they are dropped at any zoom level", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await newProject(page, "Zoomed drop");
  await importDocs(page);
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  const tools = page.getByRole("toolbar", { name: "Workspace tools" });
  await tools.getByRole("button", { name: "Zoom out" }).click();
  await tools.getByRole("button", { name: "Zoom out" }).click();
  await expect(tools.getByText("69%")).toBeVisible();
  await expect(span(page, "Payment of the settlement sum")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "Payment of the settlement sum"));
  const target = { x: 400, y: 380 };
  await page.locator(".rs-chip-grip").dragTo(canvas(page), { targetPosition: target });
  const c = card(page, "Payment of the settlement sum");
  const r = (await c.boundingBox())!;
  const cv = (await canvas(page).boundingBox())!;
  // The card is centred horizontally on the drop point, its top just above it.
  expect(Math.abs(r.x + r.width / 2 - (cv.x + target.x))).toBeLessThan(4);
  expect(Math.abs(r.y - (cv.y + target.y - 30 * 0.694))).toBeLessThan(4);
});

test("invalid anchors are never highlighted and can be re-linked; missing files are handled safely", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const projectId = await newProject(page, "Anchors");
  await importDocs(page);
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await expect(span(page, "Payment of the settlement sum")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "Payment of the settlement sum"));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  await page.getByRole("tab", { name: "Deposition of J. Roe.pdf" }).click();
  await expect(span(page, "Taken on 12 June")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "Taken on 12 June"));
  await page.getByRole("button", { name: "Add excerpt" }).click();

  // Corrupt the agreement excerpt's anchor (as if its text had changed under it).
  await expect.poll(async () => (await (await page.request.get(`/api/projects/${projectId}/workspace`)).json()).cards.length, { timeout: 20_000 }).toBe(2);
  await expect(page.getByRole("status").filter({ hasText: /^ *Saved$/ }).first()).toBeVisible({ timeout: 20_000 });
  const res = await page.request.get(`/api/projects/${projectId}/workspace`);
  const ws = await res.json();
  const excerpt = ws.cards.find((c: { text: string }) => c.text.startsWith("Payment"));
  ws.sources[excerpt.sourceId].quote = "Text that is not anywhere on this page";
  const put = await page.request.put(`/api/projects/${projectId}/workspace?baseRevision=${res.headers()["x-revision"]}`, { data: Buffer.from(JSON.stringify(ws)), headers: { "X-Octo-Client": "web", "Content-Type": "application/octet-stream" } });
  expect(put.ok()).toBe(true);
  await page.reload();
  const broken = card(page, "Payment of the settlement sum");
  await broken.getByRole("button", { name: /Open source/ }).click();
  await expect(page.getByText(/couldn't be found on its page, so nothing was highlighted/)).toBeVisible();
  await expect(page.locator(".rs-flash")).toHaveCount(0);
  // Recovery: re-link by selecting the passage again.
  await broken.getByRole("button", { name: "Fix link" }).click();
  await expect(page.getByText(/Select the passage again to re-link/)).toBeVisible();
  await selectRange(page, span(page, "Payment of the settlement sum"));
  await page.getByRole("button", { name: "Use as new source" }).click();
  await expect(broken.getByRole("button", { name: "Fix link" })).toHaveCount(0);
  await broken.getByRole("button", { name: /Open source/ }).click();
  await expect(page.locator(".rs-page[data-page='0'] .rs-flash").first()).toBeAttached();

  // The deposition's file is deleted elsewhere: its excerpt keeps its text and says the source is unavailable.
  const latest = await (await page.request.get(`/api/projects/${projectId}/workspace`)).json();
  const fileId = latest.documents.find((d: { name: string }) => d.name.startsWith("Deposition")).fileId;
  expect((await page.request.delete(`/api/files/${fileId}`, { headers: { "X-Octo-Client": "web" } })).status()).toBe(204);
  await page.reload();
  const orphan = card(page, "Taken on 12 June");
  await expect(orphan).toContainText("Source unavailable", { timeout: 30_000 });
  await orphan.getByRole("button", { name: /Open source/ }).click();
  await expect(page.getByText(/file is unavailable/)).toBeVisible();
  await expect(orphan.locator("blockquote")).toContainText("Taken on 12 June at the offices of counsel.");
});

test("dropping one excerpt onto another merges them; they move together and can be separated", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const projectId = await newProject(page, "Merge");
  await importDocs(page);
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await expect(span(page, "Payment of the settlement sum")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "Payment of the settlement sum"));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  await page.getByRole("tab", { name: "Deposition of J. Roe.pdf" }).click();
  await expect(span(page, "Taken on 12 June")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "Taken on 12 June"));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  const a = card(page, "Payment of the settlement sum");
  const b = card(page, "Taken on 12 June");

  // Drag b over a: a is shown as the merge target, then they merge on release.
  const from = (await b.locator("blockquote").boundingBox())!;
  const to = (await a.locator("blockquote").boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 8);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await expect(a).toHaveAttribute("data-merge-target", "true");
  await page.mouse.up();
  await expect(a).toHaveAttribute("data-stack", "first");
  await expect(b).toHaveAttribute("data-stack", "last");
  const edgeToEdge = async () => {
    const [ba, bb] = [await box(a), await box(b)];
    expect(bb.x).toBe(ba.x);
    expect(bb.w).toBe(ba.w);
    // Merged cards sit one below the other, joined across a small gap.
    expect(Math.abs(bb.y - (ba.y + ba.h + 36))).toBeLessThanOrEqual(1);
    await expect(page.locator(`[data-joint]`)).toHaveCount(1);
  };
  await edgeToEdge();

  // Dragging either one moves the merged pair together.
  const beforeB = await box(b);
  await dragBy(page, a.locator("blockquote"), 120, 60);
  const afterB = await box(b);
  expect(afterB.x - beforeB.x).toBeGreaterThan(100);
  await edgeToEdge();

  // Each part still opens its own source.
  await b.getByRole("button", { name: "Open source: Deposition of J. Roe, p. 1" }).click();
  await expect(page.getByRole("tab", { name: "Deposition of J. Roe.pdf", selected: true })).toBeVisible();
  await a.getByRole("button", { name: "Open source: Settlement Agreement, p. 1" }).click();
  await expect(page.getByRole("tab", { name: "Settlement Agreement.pdf", selected: true })).toBeVisible();

  // Merged state survives a reload.
  await savedWorkspace(page, projectId);
  await page.reload();
  await expect(card(page, "Taken on 12 June")).toHaveAttribute("data-stack", "last", { timeout: 30_000 });

  // Separate them from the selection bar.
  await card(page, "Taken on 12 June").locator("blockquote").click();
  await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Separate" }).click();
  await expect(page.locator(".rs-card[data-stack]")).toHaveCount(0);

  // Merge again, then Alt+drag one out: it stays where it's dropped.
  const f2 = (await card(page, "Taken on 12 June").locator("blockquote").boundingBox())!;
  const t2 = (await card(page, "Payment of the settlement sum").locator("blockquote").boundingBox())!;
  await page.mouse.move(f2.x + 20, f2.y + 8);
  await page.mouse.down();
  await page.mouse.move(t2.x + t2.width / 2, t2.y + t2.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".rs-card[data-stack]")).toHaveCount(2);
  const inStack = (await card(page, "Taken on 12 June").locator("blockquote").boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(inStack.x + 20, inStack.y + 8);
  await page.mouse.down();
  await page.mouse.move(inStack.x + 20, inStack.y + 230, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(page.locator(".rs-card[data-stack]")).toHaveCount(0);
  const out = (await card(page, "Taken on 12 June").locator("blockquote").boundingBox())!;
  expect(Math.abs(out.y - (inStack.y + 222))).toBeLessThan(12);
});

test("one tap shows a card's original context and relationships; connected cards can be gathered", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await newProject(page, "Gather");
  await importDocs(page);
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await expect(span(page, "Payment of the settlement sum")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "Payment of the settlement sum"));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  await page.getByRole("tab", { name: "Deposition of J. Roe.pdf" }).click();
  await page.getByLabel("Page number").fill("2");
  await page.getByLabel("Page number").press("Enter");
  await expect(span(page, "The broker telephoned")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "The broker telephoned"));
  await page.getByRole("button", { name: "Add excerpt" }).click();
  const pay = card(page, "Payment of the settlement sum");
  const broker = card(page, "The broker telephoned");

  // A note connected to both excerpts.
  await canvas(page).click({ position: { x: 40, y: 80 } });
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note text" }).fill("Who chased the payment?");
  const note = page.locator(".rs-card[aria-label='Note']");
  await note.locator(".h-5").first().click();
  await pay.locator("blockquote").click({ modifiers: ["Shift"] });
  await page.getByRole("combobox", { name: "Connect selected cards" }).selectOption("supports");
  await note.locator(".h-5").first().click();
  await broker.locator("blockquote").click({ modifiers: ["Shift"] });
  await page.getByRole("combobox", { name: "Connect selected cards" }).selectOption("contradicts");

  // One tap on an excerpt: its original context opens in the reader.
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await broker.locator("blockquote").click();
  await expect(page.getByRole("tab", { name: "Deposition of J. Roe.pdf", selected: true })).toBeVisible();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await expect(page.locator(".rs-page[data-page='1'] .rs-flash").first()).toBeAttached();
  const panel = page.getByRole("complementary", { name: "Relationships" });
  const bar = page.getByRole("toolbar", { name: "Selection" });
  await bar.getByRole("button", { name: "Connections (1)" }).click();
  await expect(panel.getByRole("region", { name: "Original context" })).toContainText("The broker telephoned in early April.");
  await expect(panel).toContainText("1 connection");
  await panel.getByRole("button", { name: "Close relationships" }).click();

  // One tap on the note: its relationships, with the connected cards highlighted.
  await note.locator(".h-5").first().click();
  await bar.getByRole("button", { name: "Connections (2)" }).click();
  await expect(panel).toContainText("2 connections");
  await expect(panel.getByRole("region", { name: "Connections" })).toContainText("Supports");
  await expect(panel.getByRole("region", { name: "Connections" })).toContainText("Contradicts");
  await expect(pay).toHaveAttribute("data-related", "true");
  await expect(broker).toHaveAttribute("data-related", "true");
  // Each connection opens its source in one click.
  await panel.getByRole("button", { name: "Open source: Settlement Agreement, p. 1" }).click();
  await expect(page.getByRole("tab", { name: "Settlement Agreement.pdf", selected: true })).toBeVisible();
  await expect(page.locator(".rs-page[data-page='0'] .rs-flash").first()).toBeAttached();

  // Gather: the connected cards line up beside the note, still connected.
  await panel.getByRole("button", { name: "Gather connected cards here" }).click();
  const n = await box(note);
  const [a, b] = [await box(pay), await box(broker)];
  for (const c of [a, b]) expect(c.x).toBe(n.x + n.w + 60);
  expect(Math.min(a.y, b.y)).toBe(n.y);
  const lines = await connectorLines(page);
  expect(lines).toHaveLength(2);
  for (const l of lines) expect([a, b, n].some((bx) => onEdge(l.a, bx)) && [a, b, n].some((bx) => onEdge(l.b, bx))).toBe(true);
  // Undo puts them back.
  await page.getByRole("button", { name: "Undo" }).click();
  expect((await box(pay)).x).not.toBe(n.x + n.w + 60);
});

/** A long document whose first and last pages discuss the same clause. */
async function longPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i++) {
    const p = doc.addPage([612, 792]);
    p.drawText(`CONTRACT — PAGE ${i}`, { x: 72, y: 700, size: 16, font });
    const line = i === 1 ? "Clause 4: the deposit is refundable within ten days." : i === 6 ? "Schedule: the deposit refund was refused in writing." : `General terms continue on page ${i}.`;
    p.drawText(line, { x: 72, y: 660, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

test("document and workspace work together: passage links, bring together, and results together in context", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const projectId = await newProject(page, "Together");
  await importDocs(page);
  await page.getByTestId("import-input").setInputFiles({ name: "Contract.pdf", mimeType: "application/pdf", buffer: await longPdf() });
  await expect(page.getByRole("list", { name: "Documents" }).locator("li", { hasText: "Contract.pdf" })).toContainText("6 pages", { timeout: 30_000 });

  // A note on the workspace.
  await canvas(page).click({ position: { x: 40, y: 80 } });
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note text" }).fill("Deposit dispute");
  const note = page.locator(".rs-card[aria-label='Note']");

  // 1. Drag a passage from the document onto the note: they're linked, and a line joins them.
  await page.getByRole("tab", { name: "Contract.pdf" }).click();
  await expect(span(page, "the deposit is refundable")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "the deposit is refundable"));
  await page.locator(".rs-chip-grip").dragTo(note.locator("textarea"));
  await expect(page.getByText(/Passage linked to the card/)).toBeVisible();
  let ws = await savedWorkspace(page, projectId);
  expect(ws.passageLinks).toHaveLength(1);
  expect(ws.cards).toHaveLength(1);
  const first = ws.passageLinks[0];
  await expect(page.locator(`[data-cross-link="${first.id}"] path`)).toHaveCount(1);

  // 2. Connect mode: pick the note, then a highlighted passage in the document.
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await expect(span(page, "Acme Holdings Ltd and Beta Corp")).toBeAttached({ timeout: 20_000 });
  await selectRange(page, span(page, "Acme Holdings Ltd and Beta Corp"));
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByRole("toolbar", { name: "Workspace tools" }).getByRole("button", { name: "Connect" }).click();
  await note.locator(".h-5").first().click();
  const mark = (await page.locator(".rs-mark-highlight").first().boundingBox())!;
  await page.mouse.click(mark.x + mark.width / 2, mark.y + mark.height / 2);
  await expect(page.getByText(/Passage linked to the card/).first()).toBeVisible();
  ws = await savedWorkspace(page, projectId);
  expect(ws.passageLinks).toHaveLength(2);

  // Selecting the note lists both passages and emphasises its lines; a passage scrolled away shows a stub.
  await note.locator(".h-5").first().click();
  await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Connections (2)" }).click();
  const linked = page.getByRole("complementary", { name: "Relationships" }).getByRole("region", { name: "Linked passages" });
  await expect(linked).toContainText("the deposit is refundable");
  await expect(linked).toContainText("Acme Holdings Ltd and Beta Corp");
  await linked.getByRole("button", { name: "Open linked passage: Contract, p. 1" }).click();
  await expect(page.getByRole("tab", { name: "Contract.pdf", selected: true })).toBeVisible();
  await expect(page.locator(`[data-cross-link="${first.id}"] path`).first()).toBeAttached();
  await page.getByLabel("Page number").fill("6");
  await page.getByLabel("Page number").press("Enter");
  await expect(page.getByRole("button", { name: "Linked passage on page 1" })).toBeVisible({ timeout: 10_000 });

  // 3. Bring together: page 1 and page 6 side by side, pages 2–5 collapsed.
  await page.getByRole("button", { name: "Bring together" }).click();
  await page.locator(".rs-page[data-page='5']").click({ position: { x: 300, y: 200 } });
  await page.getByLabel("Page number").fill("1");
  await page.getByLabel("Page number").press("Enter");
  await page.locator(".rs-page[data-page='0']").click({ position: { x: 300, y: 200 } });
  await expect(page.getByRole("button", { name: /Pages 2–5 collapsed/ })).toBeVisible();
  await expect(page.locator(".rs-page")).toHaveCount(2);
  await page.getByRole("button", { name: /Pages 2–5 collapsed/ }).click();
  await expect(page.locator(".rs-page")).toHaveCount(6);

  // 4. Search results from every document together, with adjustable context.
  await page.getByRole("tab", { name: "Search" }).click();
  await page.getByRole("textbox", { name: "Search all documents" }).fill("the deposit");
  await page.getByRole("button", { name: "See all results together, in context" }).click();
  const together = page.getByRole("region", { name: "Together view" });
  await expect(together.getByRole("listitem")).toHaveCount(2);
  await expect(together).toContainText("Contract, p. 1");
  await expect(together).toContainText("Contract, p. 6");
  const size = together.getByTestId("context-size");
  const before = await size.textContent();
  await together.getByRole("button", { name: "More context" }).click();
  await expect(size).not.toHaveText(before!);
  // Pinch (Ctrl+wheel) changes the context too.
  const strip = together.getByRole("listitem").first();
  const sb = (await strip.boundingBox())!;
  await page.mouse.move(sb.x + 50, sb.y + 20);
  const beforePinch = await size.textContent();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect(size).not.toHaveText(beforePinch!);
  // A strip opens its place in the document.
  await together.getByRole("button", { name: "Open in the document: Contract, p. 6" }).click();
  await expect(page.getByRole("tab", { name: "Contract.pdf", selected: true })).toBeVisible();
  await expect(page.getByLabel("Page number")).toHaveValue("6");
  await expect(page.locator(".rs-page[data-page='5'] .rs-flash").first()).toBeAttached();
});

test("toolbar tools, card actions, child workspaces, rails and layout controls", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const projectId = await newProject(page, "Parity");
  await importDocs(page);
  await page.getByRole("tab", { name: "Settlement Agreement.pdf" }).click();
  await expect(span(page, "Payment of the settlement sum")).toBeAttached({ timeout: 20_000 });
  const tools = page.getByRole("radiogroup", { name: "Tools" });
  const page1 = page.locator(".rs-page[data-page='0']");
  await expect(page1.locator(".rs-page-tag")).toHaveText("P 1");

  // Pen and highlighter draw on the page; the eraser removes ink.
  await tools.getByRole("radio", { name: "Pen" }).click();
  const pb = (await page1.boundingBox())!;
  await page.mouse.move(pb.x + 120, pb.y + 420);
  await page.mouse.down();
  await page.mouse.move(pb.x + 260, pb.y + 450, { steps: 8 });
  await page.mouse.up();
  await expect(page1.locator("svg.rs-doc-ink polyline[data-ink-id]")).toHaveCount(1);
  await tools.getByRole("radio", { name: "Highlighter" }).click();
  await page.mouse.move(pb.x + 120, pb.y + 520);
  await page.mouse.down();
  await page.mouse.move(pb.x + 320, pb.y + 520, { steps: 8 });
  await page.mouse.up();
  await expect(page1.locator("svg.rs-doc-ink polyline[data-ink-id]")).toHaveCount(2);
  await tools.getByRole("radio", { name: "Eraser" }).click();
  await page.mouse.click(pb.x + 220, pb.y + 520);
  await expect(page1.locator("svg.rs-doc-ink polyline[data-ink-id]")).toHaveCount(1);

  // Lasso: a box around a passage becomes an excerpt with an image of the area.
  await tools.getByRole("radio", { name: "Lasso" }).click();
  const target = (await span(page, "Payment of the settlement sum").boundingBox())!;
  await page.mouse.move(target.x - 6, target.y - 6);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width + 6, target.y + target.height + 6, { steps: 8 });
  await page.mouse.up();
  const area = card(page, "Payment of the settlement sum");
  await expect(area).toBeVisible();
  await expect(area.locator("img")).toBeVisible({ timeout: 15_000 });
  await tools.getByRole("radio", { name: "Select text" }).click();
  // A bar in the margin beside the excerpted passage leads to the card.
  await canvas(page).click({ position: { x: 30, y: 80 } });
  await page.locator(".rs-page[data-page='0'] .rs-margin-bar").first().click();
  await expect(area).toHaveAttribute("data-selected", "true");

  // Card actions: comment, text size, copy, copy link.
  const bar = page.getByRole("toolbar", { name: "Selection" });
  await bar.getByRole("button", { name: "Comment" }).click();
  await bar.getByRole("textbox", { name: "Card comment" }).fill("Compare with the invoice");
  await bar.getByRole("textbox", { name: "Card comment" }).press("Enter");
  await expect(area.getByRole("note", { name: "Comment: Compare with the invoice" })).toBeVisible();
  await bar.getByRole("button", { name: "Text size" }).click();
  await page.getByRole("menuitem", { name: "Large", exact: true }).click();
  await expect(area.locator("blockquote")).toHaveCSS("font-size", "16px");
  await bar.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("(Settlement Agreement, p. 1)");
  await bar.getByRole("button", { name: "Copy link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain(`/p/${projectId}?card=`);

  // To Child Workspace: the card moves into a new child workspace.
  page.once("dialog", (d) => void d.accept("Payment terms"));
  await bar.getByRole("button", { name: "To child workspace" }).click();
  await page.getByRole("menuitem", { name: "New child workspace…" }).click();
  await expect(page.getByText(/Moved to “Payment terms”/)).toBeVisible();
  await expect(area).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Workspaces" });
  await nav.getByRole("button", { name: "All workspaces" }).click();
  await page.getByRole("menuitem", { name: /Payment terms/ }).click();
  await expect(nav).toContainText("Main workspace");
  await expect(nav).toContainText("Payment terms");
  await expect(card(page, "Payment of the settlement sum")).toBeVisible();
  // The copied link opens the card, switching to its workspace.
  await nav.getByRole("button", { name: "Main workspace" }).click();
  await expect(card(page, "Payment of the settlement sum")).toHaveCount(0);
  await savedWorkspace(page, projectId);
  await page.goto(link);
  await expect(card(page, "Payment of the settlement sum")).toHaveAttribute("data-selected", "true", { timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Workspaces" })).toContainText("Payment terms");
  // Ink drawn on the document is still there after the reload.
  await expect(page.locator(".rs-page[data-page='0'] svg.rs-doc-ink polyline[data-ink-id]")).toHaveCount(1, { timeout: 20_000 });

  // Cut removes the card (and undo brings it back).
  await card(page, "Payment of the settlement sum").locator("blockquote").click();
  await page.getByRole("toolbar", { name: "Selection" }).getByRole("button", { name: "Cut" }).click();
  await expect(card(page, "Payment of the settlement sum")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Payment of the settlement sum")).toBeVisible();

  // Workspace rail: add a text box; reader rail: bookmarks and page thumbnails.
  await page.getByRole("toolbar", { name: "Workspace rail" }).getByRole("button", { name: "Add text box" }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toBeFocused();
  const rail = page.getByRole("toolbar", { name: "Reader tools" });
  await rail.getByRole("button", { name: "Bookmarks" }).click();
  await page.getByRole("dialog", { name: "Bookmarks" }).getByRole("button", { name: /Bookmark page 1/ }).click();
  await expect(page.getByRole("list", { name: "Bookmarks in this document" })).toContainText("Page 1");
  await rail.getByRole("button", { name: "Pages" }).click();
  await page.getByRole("dialog", { name: "Pages" }).getByRole("button", { name: "Go to page 2" }).click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");

  // Back returns to the previous reading place.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Page number")).toHaveValue("1");

  // The divider handle gives the whole width to one side.
  await page.getByRole("button", { name: "Show workspace only" }).click();
  await expect(page.locator("[data-viewer-doc]")).toHaveCount(0);
  await page.getByRole("button", { name: "Show document and workspace" }).click();
  await expect(page.locator("[data-viewer-doc]")).toHaveCount(1);
  await page.getByRole("button", { name: "Show document only" }).click();
  await expect(canvas(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Show document and workspace" }).click();
  await expect(canvas(page)).toBeVisible();
});

test("the documents panel can be hidden and shown again from its own toggle", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await newProject(page, "Panel toggle");
  const panel = page.getByRole("complementary", { name: "Project panel" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Hide documents panel" }).click();
  await expect(panel).toHaveCount(0);
  // The workspace takes the freed space; a strip on the left brings the panel back.
  await page.getByRole("button", { name: "Show documents panel" }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Import documents" })).toBeVisible();
  // Hidden stays hidden after a reload.
  await panel.getByRole("button", { name: "Hide documents panel" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Show documents panel" })).toBeVisible({ timeout: 30_000 });
  await expect(panel).toHaveCount(0);
});
