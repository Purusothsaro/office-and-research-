import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import "katex/dist/katex.min.css";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { documentExtensions } from "../extensions";
import { searchKey } from "../extensions/search";
import type { PaginationInfo } from "../extensions/pagination";
import { pageGeometry, type OctoDocument, type PageSetup } from "../model";
import { EquationDialog, FootnoteDialog, HeaderFooterDialog, LinkDialog, MarginsDialog, ShortcutsDialog, WordCountDialog } from "./dialogs";
import "./editor.css";
import { printDocument } from "./print";
import { Ribbon, type DialogKind } from "./Ribbon";

export interface DocumentEditorProps {
  initial: OctoDocument;
  onChange: (doc: OctoDocument) => void;
  onSaveNow?: () => void;
  onDownload?: () => void;
  onShowHistory?: () => void;
  /** Reports user-facing problems (for example a rejected image). */
  onError?: (message: string) => void;
  /** Exposes the editor instance (used by tests and the host page). */
  onReady?: (editor: Editor) => void;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function FindPanel({ editor, replaceMode, onClose }: { editor: Editor; replaceMode: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(replaceMode);
  const input = useRef<HTMLInputElement>(null);
  const state = useEditorState({ editor, selector: ({ editor: e }) => {
    const s = searchKey.getState(e.state);
    return { count: s?.matches.length ?? 0, current: s?.current ?? -1 };
  } });

  useEffect(() => {
    setShowReplace(replaceMode);
  }, [replaceMode]);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [replaceMode]);
  useEffect(() => {
    editor.commands.setSearch(query, caseSensitive);
  }, [editor, query, caseSensitive]);
  useEffect(() => () => void editor.commands.setSearch(""), [editor]);

  const close = () => {
    onClose();
    editor.commands.focus();
  };
  return (
    <div className="doc-find" role="search" aria-label="Find and replace" onKeyDown={(e) => e.key === "Escape" && close()}>
      <div className="flex items-center gap-1">
        <input
          ref={input}
          aria-label="Find"
          placeholder="Find in document"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) editor.commands.findPrevious();
              else editor.commands.findNext();
            }
          }}
          className="doc-find-input"
        />
        <span className="w-16 text-center text-xs tabular-nums text-slate-500" aria-live="polite">
          {query ? (state.count ? `${state.current + 1} of ${state.count}` : "No results") : ""}
        </span>
        <button type="button" className="rb-btn" aria-label="Match case" aria-pressed={caseSensitive} title="Match case" onClick={() => setCaseSensitive(!caseSensitive)}>
          <CaseSensitive aria-hidden className="size-4" />
        </button>
        <button type="button" className="rb-btn" aria-label="Previous match" title="Previous (Shift+Enter)" disabled={!state.count} onClick={() => editor.commands.findPrevious()}>
          <ChevronUp aria-hidden className="size-4" />
        </button>
        <button type="button" className="rb-btn" aria-label="Next match" title="Next (Enter)" disabled={!state.count} onClick={() => editor.commands.findNext()}>
          <ChevronDown aria-hidden className="size-4" />
        </button>
        <button type="button" className="rb-btn" aria-label="Close find" onClick={close}>
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {showReplace ? (
        <div className="mt-1.5 flex items-center gap-1">
          <input aria-label="Replace with" placeholder="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)} className="doc-find-input" />
          <button type="button" className="doc-find-btn" disabled={!state.count} onClick={() => editor.commands.replaceCurrent(replacement)}>
            Replace
          </button>
          <button type="button" className="doc-find-btn" disabled={!state.count} onClick={() => editor.commands.replaceAll(replacement)}>
            Replace all
          </button>
        </div>
      ) : (
        <button type="button" className="mt-1 text-xs font-medium text-[#1e4f8a] hover:underline" onClick={() => setShowReplace(true)}>
          Replace…
        </button>
      )}
    </div>
  );
}

function NavigationPane({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const list: { level: number; text: string; pos: number }[] = [];
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") list.push({ level: node.attrs.level as number, text: node.textContent, pos });
        return node.isBlock && node.type.name !== "heading";
      });
      return list;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  return (
    <aside className="doc-nav" aria-label="Navigation">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-800">Navigation</h2>
        <button type="button" className="rb-btn" aria-label="Close navigation pane" onClick={onClose}>
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {headings.length === 0 ? (
        <p className="px-3 text-xs text-slate-500">Headings in your document appear here.</p>
      ) : (
        <ul className="pb-3">
          {headings.map((h) => (
            <li key={h.pos}>
              <button
                type="button"
                className="doc-nav-item"
                style={{ paddingLeft: 12 + (h.level - 1) * 14 }}
                onClick={() => editor.chain().focus().setTextSelection(h.pos + 1).scrollIntoView().run()}
              >
                {h.text || "(empty heading)"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function readImage(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("decode"));
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function DocumentEditor({ initial, onChange, onSaveNow, onDownload, onShowHistory, onError, onReady }: DocumentEditorProps) {
  const [page, setPageState] = useState<PageSetup>(initial.page);
  const [info, setInfo] = useState<PaginationInfo>({ pages: 1, blockPages: [] });
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [find, setFind] = useState<{ replace: boolean } | null>(null);
  const [nav, setNav] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [footnoteEdit, setFootnoteEdit] = useState<{ pos: number; text: string } | null>(null);
  const [mathEdit, setMathEdit] = useState<{ kind: "inline" | "block"; latex: string; pos: number } | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const imageInput = useRef<HTMLInputElement>(null);

  const extensions = useMemo(
    () =>
      documentExtensions({
        paginate: true,
        onLayout: setInfo,
        onMathClick: (kind, latex, pos) => setMathEdit({ kind, latex, pos }),
      }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: initial.content,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { class: "doc-flow", "aria-label": "Document", spellcheck: "true" } },
    onCreate: ({ editor: e }) => {
      e.commands.setPageSetup(initial.page);
    },
    onUpdate: ({ editor: e }) => onChangeRef.current({ version: 1, page: pageRef.current, content: e.getJSON() }),
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  const setPage = useCallback(
    (next: PageSetup) => {
      setPageState(next);
      pageRef.current = next;
      editor?.commands.setPageSetup(next);
      if (editor) onChangeRef.current({ version: 1, page: next, content: editor.getJSON() });
    },
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    const onFootnote = (event: Event) => {
      const pos = (event as CustomEvent<{ pos: number }>).detail.pos;
      const node = editor.state.doc.nodeAt(pos);
      if (node?.type.name === "footnote") setFootnoteEdit({ pos, text: node.attrs.text as string });
    };
    editor.view.dom.addEventListener("octo:edit-footnote", onFootnote);
    return () => editor.view.dom.removeEventListener("octo:edit-footnote", onFootnote);
  }, [editor]);

  const print = useCallback(() => {
    if (editor) printDocument(editor, pageRef.current);
  }, [editor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "f" && !e.shiftKey) setFind({ replace: false });
      else if (key === "h" && !e.shiftKey) setFind({ replace: true });
      else if (key === "k" && !e.shiftKey && editor?.isFocused) setDialog("link");
      else if (key === "p" && !e.shiftKey) print();
      else if (key === "s" && !e.shiftKey) onSaveNow?.();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, print, onSaveNow]);

  const currentPage = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? (info.blockPages[e.state.selection.$from.index(0)] ?? 1) : 1),
  });
  const counts = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? { words: e.storage.characterCount.words(), characters: e.storage.characterCount.characters() } : { words: 0, characters: 0 }),
  });

  // Keep the scaled page box sized to the scaled content.
  const paper = useRef<HTMLDivElement>(null);
  const [paperHeight, setPaperHeight] = useState(0);
  useLayoutEffect(() => {
    const el = paper.current;
    if (!el) return;
    const update = () => setPaperHeight(el.offsetHeight);
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  const onImageFile = async (file: File | undefined) => {
    if (!file || !editor) return;
    if (!IMAGE_TYPES.includes(file.type)) return onError?.("Images must be PNG, JPEG, GIF or WebP.");
    if (file.size > MAX_IMAGE_BYTES) return onError?.("Images must be smaller than 10 MB.");
    try {
      const img = await readImage(file);
      const max = pageGeometry(pageRef.current).contentWidthPx;
      const scale = Math.min(1, max / img.width);
      editor.chain().focus().setImage({ src: img.src, alt: file.name.replace(/\.[^.]+$/, "") }).updateAttributes("image", { width: Math.round(img.width * scale), height: Math.round(img.height * scale) }).run();
    } catch {
      onError?.("The image could not be read.");
    }
  };

  if (!editor) return null;
  const g = pageGeometry(page);

  return (
    <div className="doc-editor">
      <Ribbon
        editor={editor}
        actions={{
          page,
          setPage,
          openDialog: setDialog,
          insertImage: () => imageInput.current?.click(),
          toggleFind: (replace) => setFind(find && find.replace === replace ? null : { replace }),
          toggleNavigation: () => setNav(!nav),
          navigationOpen: nav,
          zoom,
          setZoom,
          print,
          onSaveNow,
          onDownload,
          onShowHistory,
        }}
      />
      <input ref={imageInput} type="file" accept={IMAGE_TYPES.join(",")} hidden data-testid="image-input" onChange={(e) => (void onImageFile(e.target.files?.[0]), (e.target.value = ""))} />
      <div className="doc-body">
        {nav && <NavigationPane editor={editor} onClose={() => setNav(false)} />}
        <div className="doc-canvas">
          {find && <FindPanel editor={editor} replaceMode={find.replace} onClose={() => setFind(null)} />}
          <div className="doc-paper-frame" style={{ width: g.widthPx * zoom, height: paperHeight * zoom }}>
            <div
              ref={paper}
              className="doc-paper"
              style={
                {
                  width: g.widthPx,
                  transform: zoom === 1 ? undefined : `scale(${zoom})`,
                  "--doc-margin-left": `${g.marginsPx.left}px`,
                  "--doc-margin-right": `${g.marginsPx.right}px`,
                } as React.CSSProperties
              }
            >
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
      </div>
      <footer className="doc-status" aria-label="Document status">
        <span>
          Page {currentPage} of {info.pages}
        </span>
        <span>{counts.words.toLocaleString()} words</span>
        <span>{counts.characters.toLocaleString()} characters</span>
        <span className="ml-auto flex items-center gap-2">
          <label htmlFor="doc-zoom" className="sr-only">
            Zoom
          </label>
          <input id="doc-zoom" type="range" min={50} max={200} step={10} value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} className="w-28" />
          <span className="w-10 tabular-nums">{Math.round(zoom * 100)}%</span>
        </span>
      </footer>

      {dialog === "link" && <LinkDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === "equation" && (
        <EquationDialog
          initial=""
          display={false}
          onClose={() => setDialog(null)}
          onSubmit={(latex, display) => {
            if (display) editor.chain().focus().insertBlockMath({ latex }).run();
            else editor.chain().focus().insertInlineMath({ latex }).run();
            setDialog(null);
          }}
        />
      )}
      {mathEdit && (
        <EquationDialog
          initial={mathEdit.latex}
          display={mathEdit.kind === "block"}
          onClose={() => setMathEdit(null)}
          onSubmit={(latex) => {
            if (mathEdit.kind === "block") editor.chain().setNodeSelection(mathEdit.pos).updateBlockMath({ latex }).focus().run();
            else editor.chain().setNodeSelection(mathEdit.pos).updateInlineMath({ latex }).focus().run();
            setMathEdit(null);
          }}
        />
      )}
      {dialog === "footnote" && (
        <FootnoteDialog
          initial=""
          onClose={() => setDialog(null)}
          onSubmit={(text) => {
            editor.chain().focus().insertFootnote(text).run();
            setDialog(null);
          }}
        />
      )}
      {footnoteEdit && (
        <FootnoteDialog
          initial={footnoteEdit.text}
          onClose={() => setFootnoteEdit(null)}
          onDelete={() => {
            editor.chain().focus().deleteRange({ from: footnoteEdit.pos, to: footnoteEdit.pos + 1 }).run();
            setFootnoteEdit(null);
          }}
          onSubmit={(text) => {
            editor.chain().focus().command(({ tr }) => {
              tr.setNodeAttribute(footnoteEdit.pos, "text", text);
              return true;
            }).run();
            setFootnoteEdit(null);
          }}
        />
      )}
      {dialog === "headerFooter" && <HeaderFooterDialog page={page} onClose={() => setDialog(null)} onSubmit={(next) => (setPage(next), setDialog(null))} />}
      {dialog === "margins" && <MarginsDialog margins={page.margins} onClose={() => setDialog(null)} onSubmit={(margins) => (setPage({ ...page, margins }), setDialog(null))} />}
      {dialog === "wordCount" && <WordCountDialog editor={editor} pages={info.pages} onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
