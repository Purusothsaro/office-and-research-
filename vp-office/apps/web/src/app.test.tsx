import { IndexedDbRepository } from "@octo/storage";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

const bytes = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

let repo: IndexedDbRepository;

function renderApp(path = "/") {
  repo = new IndexedDbRepository(`web-${crypto.randomUUID()}`);
  const user = userEvent.setup();
  const view = render(<App repository={repo} initialPath={path} />);
  return { user, ...view };
}

afterEach(async () => {
  // Unmount first so editors can flush drafts before the database closes.
  cleanup();
  await new Promise((r) => setTimeout(r, 50));
  repo?.close();
});

const fileList = () => screen.getByRole("list", { name: "Files" });
const fileButton = (name: string) => within(fileList()).getByRole("button", { name: new RegExp(`^${name.replace(/[.()]/g, "\\$&")},`) });

describe("home screen", () => {
  it("shows an empty state, then lists new files with metadata", async () => {
    const { user } = renderApp();
    expect(await screen.findByText("No files yet.")).toBeInTheDocument();
    await repo.create({ name: "Brief.txt", format: "txt", bytes: bytes("hello") });
    const item = await screen.findByRole("button", { name: /^Brief\.txt, Plain text · 5 B · Edited just now$/ });
    expect(item).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Documents/ }));
    expect(fileButton("Brief.txt")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Spreadsheets/ }));
    expect(screen.getByText("No files yet.")).toBeInTheDocument();
  });

  it("creates a blank document and opens it", async () => {
    const { user } = renderApp();
    await screen.findByText("No files yet.");
    await user.click(screen.getByRole("button", { name: "Blank document" }));
    expect(await screen.findByRole("heading", { name: "Untitled document.docx", level: 1 }, { timeout: 10_000 })).toBeInTheDocument();
    expect(await screen.findByRole("tablist", { name: "Ribbon" })).toBeInTheDocument();
    const [file] = await repo.list();
    expect(file).toMatchObject({ format: "docx", kind: "document" });
  });

  it("creates a file from a template", async () => {
    const { user } = renderApp();
    await screen.findByText("No files yet.");
    await user.click(screen.getByRole("button", { name: "All templates" }));
    // Spreadsheet and presentation editors need a real browser; their flows are covered end to end.
    await user.click(screen.getByRole("button", { name: /Legal memorandum/ }));
    expect(await screen.findByRole("heading", { name: "Legal memorandum.docx", level: 1 }, { timeout: 10_000 })).toBeInTheDocument();
    expect((await repo.list())[0]).toMatchObject({ templateId: "legal-memo", format: "docx" });
  });

  it("uploads valid files and reports invalid ones", async () => {
    const { user } = renderApp();
    await screen.findByText("No files yet.");
    const input = screen.getByTestId("file-input");
    await user.upload(input, [
      new File(["a,b\n1,2"], "data.csv", { type: "text/csv" }),
      new File(["not a zip"], "fake.docx"),
    ]);
    expect(await screen.findByText(/fake\.docx: This file is not a valid Word document/)).toBeInTheDocument();
    expect(await screen.findByText("Uploaded data.csv")).toBeInTheDocument();
    expect(fileButton("data.csv")).toBeInTheDocument();
    expect((await repo.list()).map((f) => f.name)).toEqual(["data.csv"]);
  });

  it("searches by name and format", async () => {
    const { user } = renderApp();
    await repo.create({ name: "Lease review.txt", format: "txt", bytes: bytes("x") });
    await repo.create({ name: "Budget.csv", format: "csv", bytes: bytes("x") });
    await screen.findByText(/Lease review\.txt/);
    await user.keyboard("/");
    expect(screen.getByRole("searchbox", { name: "Search files" })).toHaveFocus();
    await user.keyboard("lease");
    expect(screen.getByRole("heading", { name: 'Results for "lease"' })).toBeInTheDocument();
    expect(within(fileList()).getAllByRole("button", { name: /,/ })).toHaveLength(1);
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "csv");
    expect(fileButton("Budget.csv")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No files match your search.")).toBeInTheDocument();
  });

  it("renames with F2 and keeps the extension", async () => {
    const { user } = renderApp();
    await repo.create({ name: "Draft.txt", format: "txt", bytes: bytes("x") });
    (await screen.findByRole("button", { name: /^Draft\.txt,/ })).focus();
    await user.keyboard("{F2}");
    const dialog = screen.getByRole("dialog", { name: "Rename file" });
    const input = within(dialog).getByRole("textbox", { name: "Name" });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "Final: v2{Enter}");
    expect(await screen.findByRole("button", { name: /^Final v2\.txt,/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes only after confirmation", async () => {
    const { user } = renderApp();
    await repo.create({ name: "Old.txt", format: "txt", bytes: bytes("x") });
    (await screen.findByRole("button", { name: /^Old\.txt,/ })).focus();
    await user.keyboard("{Delete}");
    const dialog = screen.getByRole("dialog", { name: "Delete file?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await repo.list()).toHaveLength(1);
    await user.keyboard("{Delete}");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No files yet.")).toBeInTheDocument();
    expect(await repo.list()).toHaveLength(0);
  });

  it("supports arrow-key navigation and a keyboard actions menu", async () => {
    const { user } = renderApp();
    await repo.create({ name: "A.txt", format: "txt", bytes: bytes("a") });
    await repo.create({ name: "B.txt", format: "txt", bytes: bytes("b") });
    const b = await screen.findByRole("button", { name: /^B\.txt,/ });
    expect(b).toHaveAttribute("tabindex", "0");
    expect(fileButton("A.txt")).toHaveAttribute("tabindex", "-1");
    b.focus();
    await user.keyboard("{ArrowRight}");
    expect(fileButton("A.txt")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(b).toHaveFocus();

    await user.keyboard("{Shift>}{F10}{/Shift}");
    const menu = screen.getByRole("menu", { name: "Actions for B.txt" });
    expect(within(menu).getByRole("menuitem", { name: /Open/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(within(menu).getByRole("menuitem", { name: /Duplicate/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("button", { name: /^B \(copy\)\.txt,/ })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the shortcuts help with ?", async () => {
    const { user } = renderApp();
    await screen.findByText("No files yet.");
    await user.keyboard("?");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });
});

describe("autosave and recovery", () => {
  it("autosaves edits as new revisions", async () => {
    const { user } = renderApp();
    const file = await repo.create({ name: "Note.txt", format: "txt", bytes: bytes("Hello") });
    await user.click(await screen.findByRole("button", { name: /^Note\.txt,/ }));
    const editor = await screen.findByRole("textbox", { name: "Contents of Note.txt" });
    expect(editor).toHaveValue("Hello");
    await user.type(editor, " world");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument(), { timeout: 5000 });
    expect(str(await repo.getContent(file.id))).toBe("Hello world");
    expect((await repo.get(file.id)).revision).toBe(2);
    expect(await repo.getDraft(file.id)).toBeUndefined();
    expect(screen.getByText("2 words")).toBeInTheDocument();
  });

  it("saves immediately with Ctrl+S", async () => {
    const { user } = renderApp();
    const file = await repo.create({ name: "Quick.txt", format: "txt", bytes: bytes("") });
    await user.click(await screen.findByRole("button", { name: /^Quick\.txt,/ }));
    await user.type(await screen.findByRole("textbox"), "x");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(async () => expect(str(await repo.getContent(file.id))).toBe("x"), { timeout: 1000 });
  });

  it("offers to restore or discard recovered drafts", async () => {
    const { user } = renderApp();
    const keep = await repo.create({ name: "Keep.txt", format: "txt", bytes: bytes("saved") });
    const drop = await repo.create({ name: "Drop.txt", format: "txt", bytes: bytes("saved") });
    await repo.putDraft({ fileId: keep.id, baseRevision: 1, content: bytes("unsaved work") });
    await repo.putDraft({ fileId: drop.id, baseRevision: 1, content: bytes("junk") });

    const banner = await screen.findByRole("region", { name: "Unsaved changes recovered" });
    await user.click(await within(banner).findByRole("button", { name: "Discard unsaved changes to Drop.txt" }));
    await waitFor(() => expect(within(banner).queryByText("Drop.txt")).not.toBeInTheDocument());
    expect(await repo.getDraft(drop.id)).toBeUndefined();

    await user.click(within(banner).getByRole("button", { name: "Restore unsaved changes to Keep.txt" }));
    expect(await screen.findByRole("textbox")).toHaveValue("unsaved work");
    expect(screen.getByText(/Restored unsaved changes/)).toBeInTheDocument();
    // Recovered work is not committed until the user decides.
    expect(str(await repo.getContent(keep.id))).toBe("saved");
    await user.click(screen.getByRole("button", { name: "Keep and save" }));
    await waitFor(async () => expect(str(await repo.getContent(keep.id))).toBe("unsaved work"));
    expect(await repo.getDraft(keep.id)).toBeUndefined();
  });

  it("discards restored changes back to the saved version", async () => {
    const { user } = renderApp();
    const file = await repo.create({ name: "R.txt", format: "txt", bytes: bytes("saved") });
    await repo.putDraft({ fileId: file.id, baseRevision: 1, content: bytes("draft") });
    await user.click(await screen.findByRole("button", { name: "Restore unsaved changes to R.txt" }));
    expect(await screen.findByRole("textbox")).toHaveValue("draft");
    await user.click(screen.getByRole("button", { name: "Discard restored changes" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("saved"));
    expect(await repo.getDraft(file.id)).toBeUndefined();
  });

  it("detects a conflicting save and keeps both versions", async () => {
    const { user } = renderApp();
    const file = await repo.create({ name: "Shared.txt", format: "txt", bytes: bytes("v1") });
    await user.click(await screen.findByRole("button", { name: /^Shared\.txt,/ }));
    const editor = await screen.findByRole("textbox");
    // Another tab saves first.
    await repo.saveContent(file.id, bytes("other tab"), 1);
    await user.type(editor, " mine");
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent("Your edits have not overwritten it");
    expect(str(await repo.getContent(file.id))).toBe("other tab");

    await user.click(within(alert).getByRole("button", { name: "Save my version as a copy" }));
    expect(await screen.findByRole("heading", { name: "Shared (conflicted copy).txt", level: 1 })).toBeInTheDocument();
    const files = await repo.list();
    const copy = files.find((f) => f.name === "Shared (conflicted copy).txt")!;
    expect(str(await repo.getContent(copy.id))).toBe("v1 mine");
    expect(str(await repo.getContent(file.id))).toBe("other tab");
  });

  it("shows a not-found page for missing files", async () => {
    renderApp("/edit/does-not-exist");
    expect(await screen.findByRole("heading", { name: "File not found" })).toBeInTheDocument();
  });
});
