import { expect, test } from "./fixtures/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

test("builds, presents, saves and reopens a presentation", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Blank presentation" }).click();
  await expect(page.getByRole("navigation", { name: "Slides" })).toBeVisible({ timeout: 30_000 });
  const stage = page.locator(".sl-stage");

  // Edit the title placeholder in place.
  await stage.locator("[data-element-id]").first().dblclick();
  const editor = page.getByRole("textbox", { name: "Edit text" });
  await expect(editor).toBeFocused();
  await page.keyboard.type("Settlement Strategy");
  await page.keyboard.press("Escape");
  await expect(stage).toContainText("Settlement Strategy");

  // New slide with a title and content layout.
  await page.getByRole("button", { name: "New slide" }).click();
  await page.getByRole("menuitem", { name: "Title and content" }).click();
  await expect(page.getByText("Slide 2 of 2")).toBeVisible();

  // Insert a shape and drag it.
  await page.getByRole("button", { name: "Shape" }).click();
  await page.getByRole("menuitem", { name: "Ellipse" }).click();
  const shape = stage.locator(".sl-el[data-kind='shape'] > div");
  const before = (await shape.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  const after = (await shape.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(100);

  // Undo and redo the move.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.round((await shape.boundingBox())!.x)).toBe(Math.round(before.x));
  await page.keyboard.press("Control+y");

  await page.getByRole("textbox", { name: "Speaker notes" }).fill("Mention the deadline.");

  // Move slide 2 to the front.
  await page.getByRole("button", { name: "Move slide 2 up" }).click();
  await expect(page.getByRole("button", { name: "Slide 1", exact: true })).toHaveAttribute("aria-current", "true");

  // Present and advance.
  await page.getByRole("button", { name: "Present" }).click();
  const presenter = page.getByRole("dialog", { name: "Presentation" });
  await expect(presenter).toBeVisible();
  await expect(presenter).toContainText("1 / 2");
  await page.keyboard.press("ArrowRight");
  await expect(presenter).toContainText("2 / 2");
  await expect(presenter).toContainText("Settlement Strategy");
  await page.keyboard.press("Escape");
  await expect(presenter).toBeHidden();

  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Slides" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Slide 1 of 2")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Speaker notes" })).toHaveValue("Mention the deadline.");
  await expect(page.locator(".sl-stage .sl-el[data-kind='shape']")).toHaveCount(1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PPTX" }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await downloadPromise).path())!));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides).toHaveLength(2);
  const all = (await Promise.all(slides.map((f) => zip.file(f)!.async("string")))).join("");
  expect(all).toContain("Settlement Strategy");
  expect(all).toContain('prst="ellipse"');
  const notes = (await Promise.all(Object.keys(zip.files).filter((f) => f.startsWith("ppt/notesSlides/notesSlide")).map((f) => zip.file(f)!.async("string")))).join("");
  expect(notes).toContain("Mention the deadline.");
});
