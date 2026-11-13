import { TEMPLATES } from "@octo/core";
import { importDocx } from "@octo/editor-document";
import { IndexedDbRepository } from "@octo/storage";
import type { Editor } from "@tiptap/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

let repo: IndexedDbRepository;

afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 50));
  repo?.close();
});

async function openDocx(name: string, bytes: Uint8Array) {
  repo = new IndexedDbRepository(`docx-${crypto.randomUUID()}`);
  const file = await repo.create({ name, format: "docx", bytes });
  const user = userEvent.setup();
  render(<App repository={repo} initialPath={`/edit/${file.id}`} />);
  await screen.findByRole("tablist", { name: "Ribbon" });
  const dom = await waitFor(() => {
    const el = document.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
    if (!el?.editor) throw new Error("editor not ready");
    return el;
  });
  return { file, user, editor: dom.editor!, dom };
}

const plainText = async (bytes: Uint8Array) => {
  const { doc } = await importDocx(bytes);
  const walk = (n: { text?: string; content?: unknown[] }): string => (n.text ?? "") + (n.content ?? []).map((c) => walk(c as never)).join("");
  return walk(doc.content);
};

describe("document editor", () => {
  it("opens a DOCX template with its content and styles", async () => {
    const template = await TEMPLATES.find((t) => t.id === "engagement-letter")!.build();
    const { dom } = await openDocx(template.name, template.bytes);
    expect(within(dom).getByText("Letter of Engagement")).toBeInTheDocument();
    expect(within(dom).getByRole("heading", { name: "Scope of services" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
  });

  it("autosaves edits back to DOCX and reopens them losslessly", async () => {
    const template = await TEMPLATES.find((t) => t.id === "legal-memo")!.build();
    const { file, editor } = await openDocx(template.name, template.bytes);
    editor.chain().focus("end").insertContent("Counsel recommends settlement.").toggleBold().insertContent(" Urgent.").run();
    await waitFor(async () => expect((await repo.get(file.id)).revision).toBe(2), { timeout: 8000 });
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
    const bytes = await repo.getContent(file.id);
    expect(await plainText(bytes)).toContain("Counsel recommends settlement. Urgent.");
    // Real DOCX XML holds the text too, not only the embedded source.
    const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Counsel recommends settlement.");
    expect((await importDocx(bytes)).fromEmbedded).toBe(true);
  });

  it("applies formatting from the ribbon", async () => {
    const blank = await TEMPLATES.find((t) => t.id === "nda")!.build();
    const { user, editor } = await openDocx(blank.name, blank.bytes);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(editor.isActive("bold")).toBe(true);
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("option", { name: "Heading 2" }));
    expect(editor.isActive("heading", { level: 2 })).toBe(true);
    await user.click(screen.getByRole("tab", { name: "Insert" }));
    await user.click(screen.getByRole("button", { name: "Page break" }));
    expect(editor.getJSON().content!.some((n) => n.type === "pageBreak")).toBe(true);
  });

  it("finds and replaces text", async () => {
    const nda = await TEMPLATES.find((t) => t.id === "nda")!.build();
    const { user, editor } = await openDocx(nda.name, nda.bytes);
    await user.click(screen.getByRole("button", { name: "Replace" }));
    const search = screen.getByRole("search", { name: "Find and replace" });
    await user.type(within(search).getByRole("textbox", { name: "Find" }), "receiving Party");
    expect(await within(search).findByText("1 of 2")).toBeInTheDocument();
    await user.type(within(search).getByRole("textbox", { name: "Replace with" }), "Recipient");
    await user.click(within(search).getByRole("button", { name: "Replace all" }));
    expect(editor.getText()).not.toContain("receiving Party");
    expect(editor.getText().match(/Recipient/g)).toHaveLength(2);
  });

  it("warns when an uploaded document has unsupported content", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/comments.xml", "<w:comments/>");
    zip.file(
      "word/document.xml",
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Reviewed draft</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
    );
    const { dom } = await openDocx("Draft.docx", await zip.generateAsync({ type: "uint8array" }));
    expect(within(dom).getByText("Reviewed draft")).toBeInTheDocument();
    expect(screen.getByText("Some content in this document isn't supported yet.")).toBeInTheDocument();
    expect(screen.getByText("Comments aren't supported yet and were removed.")).toBeInTheDocument();
  });

  it("restores an earlier revision from version history", async () => {
    const memo = await TEMPLATES.find((t) => t.id === "legal-memo")!.build();
    const { file, user, editor } = await openDocx(memo.name, memo.bytes);
    editor.chain().focus("end").insertContent("Temporary paragraph").run();
    await waitFor(async () => expect((await repo.get(file.id)).revision).toBe(2), { timeout: 8000 });
    await user.click(screen.getByRole("tab", { name: "Review" }));
    await user.click(screen.getByRole("button", { name: "Version history" }));
    const panel = await screen.findByRole("complementary", { name: "Version history" });
    await user.click(within(panel).getByRole("button", { name: "Restore revision 1" }));
    await waitFor(async () => expect((await repo.get(file.id)).revision).toBe(3));
    expect(await plainText(await repo.getContent(file.id))).not.toContain("Temporary paragraph");
    expect((await repo.listRevisions(file.id))[0]!.note).toBe("Restored revision 1");
    const reopened = await waitFor(() => {
      const el = document.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
      if (!el?.editor || el.editor.getText().includes("Temporary")) throw new Error("not reloaded");
      return el.editor;
    });
    expect(reopened.getText()).toContain("Question presented");
  });

  it("recovers unsaved document drafts", async () => {
    const memo = await TEMPLATES.find((t) => t.id === "legal-memo")!.build();
    repo = new IndexedDbRepository(`docx-${crypto.randomUUID()}`);
    const file = await repo.create({ name: memo.name, format: "docx", bytes: memo.bytes });
    const { doc } = await importDocx(memo.bytes);
    doc.content.content!.push({ type: "paragraph", content: [{ type: "text", text: "Unsaved recovery text" }] });
    await repo.putDraft({ fileId: file.id, baseRevision: 1, content: new TextEncoder().encode(JSON.stringify(doc)) });
    const user = userEvent.setup();
    render(<App repository={repo} initialPath={`/edit/${file.id}`} />);
    expect(await screen.findByText("Unsaved recovery text")).toBeInTheDocument();
    expect(screen.getByText(/Restored unsaved changes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep and save" }));
    await waitFor(async () => expect(await plainText(await repo.getContent(file.id))).toContain("Unsaved recovery text"), { timeout: 8000 });
  });
});
