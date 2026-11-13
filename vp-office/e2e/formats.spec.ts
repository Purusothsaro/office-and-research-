import { expect, test } from "./fixtures/test";
import { readFile } from "node:fs/promises";

test("edits a Markdown file and saves it as Markdown", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Case notes\n\n- First point\n- Second point\n") });
  await page.getByRole("button", { name: /^notes\.md,/ }).click();
  const doc = page.locator(".doc-flow");
  await expect(doc.locator("h1")).toHaveText("Case notes", { timeout: 30_000 });
  await expect(doc.locator("li")).toHaveCount(2);
  await expect(page.getByText(/Markdown keeps headings/)).toBeVisible();
  await doc.locator("li").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Third point");
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const md = await readFile((await (await dl).path())!, "utf8");
  expect(md).toContain("# Case notes");
  expect(md).toMatch(/-\s+Third point/);
});

test("opens an RTF file, edits it and saves RTF", async ({ page }) => {
  await page.goto("/");
  const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}}\pard\b Engagement\b0\par\pard Fees are due monthly.\par}`;
  await page.getByTestId("file-input").setInputFiles({ name: "letter.rtf", mimeType: "application/rtf", buffer: Buffer.from(rtf) });
  await page.getByRole("button", { name: /^letter\.rtf,/ }).click();
  const doc = page.locator(".doc-flow");
  await expect(doc.locator("strong")).toHaveText("Engagement", { timeout: 30_000 });
  await doc.getByText("Fees are due monthly.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Payable in USD.");
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const out = await readFile((await (await dl).path())!, "latin1");
  expect(out.startsWith(String.raw`{\rtf1`)).toBe(true);
  expect(out).toContain("Fees are due monthly. Payable in USD.");
  expect(out).toContain(String.raw`\b Engagement`);
});
