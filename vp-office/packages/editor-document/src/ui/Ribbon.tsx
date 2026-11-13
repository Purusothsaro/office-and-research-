import { useEditorState, type Editor } from "@tiptap/react";
import {
  Asterisk,
  Baseline,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  Circle,
  Clock,
  Columns2,
  Download,
  File,
  Hash,
  Heading,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Keyboard,
  Link,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  ListTree,
  Minus,
  MoveRight,
  PaintBucket,
  PanelLeft,
  PanelTop,
  Pilcrow,
  Printer,
  RectangleHorizontal,
  RectangleVertical,
  Redo2,
  RemoveFormatting,
  Replace,
  Ruler,
  Save,
  Search,
  SeparatorHorizontal,
  Shapes,
  Sigma,
  Square,
  SquareDashed,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableCellsMerge,
  TableCellsSplit,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Trash,
  Triangle,
  Underline,
  Undo2,
  WholeWord,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { BorderStyle } from "../extensions/paragraph-format";
import type { ShapeKind } from "../extensions/nodes";
import { MARGIN_PRESETS, PAPER_SIZES, type PageSetup, type PaperSize } from "../model";
import { ColorPalette, Dropdown, MenuItem, RibbonButton, RibbonGroup, RibbonSelect } from "./controls";

export type DialogKind = "link" | "equation" | "footnote" | "headerFooter" | "margins" | "wordCount" | "shortcuts";

export interface RibbonActions {
  page: PageSetup;
  setPage: (page: PageSetup) => void;
  openDialog: (kind: DialogKind) => void;
  insertImage: () => void;
  toggleFind: (replace: boolean) => void;
  toggleNavigation: () => void;
  navigationOpen: boolean;
  zoom: number;
  setZoom: (zoom: number) => void;
  print: () => void;
  onSaveNow?: (() => void) | undefined;
  onDownload?: (() => void) | undefined;
  onShowHistory?: (() => void) | undefined;
}

export const FONTS = ["Calibri", "Arial", "Cambria", "Georgia", "Garamond", "Times New Roman", "Verdana", "Courier New"];
const SIZES = ["8", "9", "10", "10.5", "11", "12", "14", "16", "18", "20", "24", "28", "36", "48", "72"];
const LINE_HEIGHTS = [1, 1.15, 1.5, 2, 2.5, 3];

const STYLES: { id: string; label: string; className: string }[] = [
  { id: "normal", label: "Normal", className: "text-[13px]" },
  { id: "title", label: "Title", className: "text-[18px] font-light" },
  { id: "subtitle", label: "Subtitle", className: "text-[13px] text-slate-500" },
  { id: "h1", label: "Heading 1", className: "text-[15px] font-semibold text-[#1e3a5f]" },
  { id: "h2", label: "Heading 2", className: "text-[14px] font-semibold text-[#1e3a5f]" },
  { id: "h3", label: "Heading 3", className: "text-[13px] font-semibold text-[#1e3a5f]" },
  { id: "quote", label: "Quote", className: "text-[13px] italic text-slate-600" },
];

function currentStyle(editor: Editor): string {
  if (editor.isActive("blockquote")) return "quote";
  for (const level of [1, 2, 3, 4, 5, 6]) if (editor.isActive("heading", { level })) return `h${level}`;
  const name = editor.getAttributes("paragraph").styleName as string | null;
  return name ?? "normal";
}

function applyStyle(editor: Editor, id: string) {
  const chain = editor.chain().focus();
  if (editor.isActive("blockquote") && id !== "quote") chain.lift("blockquote");
  if (id.startsWith("h")) {
    chain.setNode("heading", { level: Number(id.slice(1)) }).run();
    return;
  }
  chain.setNode("paragraph");
  if (id === "quote") {
    chain.setParagraphFormat({ styleName: null }).wrapIn("blockquote").run();
    return;
  }
  chain.setParagraphFormat({ styleName: id === "normal" ? null : (id as "title" | "subtitle") }).run();
}

const SHAPES: { kind: ShapeKind; label: string; icon: typeof Square }[] = [
  { kind: "rectangle", label: "Rectangle", icon: Square },
  { kind: "rounded", label: "Rounded rectangle", icon: SquareDashed },
  { kind: "ellipse", label: "Ellipse", icon: Circle },
  { kind: "triangle", label: "Triangle", icon: Triangle },
  { kind: "line", label: "Line", icon: Minus },
  { kind: "arrow", label: "Arrow", icon: MoveRight },
];

function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <div>
      <div className="grid grid-cols-8 gap-0.5" onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: 64 }, (_, i) => {
          const r = Math.floor(i / 8) + 1;
          const c = (i % 8) + 1;
          const on = r <= hover[0] && c <= hover[1];
          return (
            <button
              key={i}
              type="button"
              aria-label={`${r} by ${c} table`}
              onMouseEnter={() => setHover([r, c])}
              onFocus={() => setHover([r, c])}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r, c)}
              className={`size-4 border ${on ? "border-[#1e4f8a] bg-[#d6e3f3]" : "border-slate-300 bg-white"}`}
            />
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-slate-600">{hover[0] ? `${hover[0]} × ${hover[1]}` : "Choose a size"}</p>
    </div>
  );
}

type TabId = "file" | "home" | "insert" | "layout" | "references" | "review" | "view" | "table" | "image";

export function Ribbon({ editor, actions }: { editor: Editor; actions: RibbonActions }) {
  const [tab, setTab] = useState<TabId>("home");
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      sup: e.isActive("superscript"),
      sub: e.isActive("subscript"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      align: (["left", "center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? "left",
      font: ((e.getAttributes("textStyle").fontFamily as string | undefined) ?? "Calibri").split(",")[0]!.replace(/["']/g, ""),
      size: ((e.getAttributes("textStyle").fontSize as string | undefined) ?? "11pt").replace(/pt$/, ""),
      style: currentStyle(e),
      lineHeight: (e.getAttributes("paragraph").lineHeight ?? e.getAttributes("heading").lineHeight ?? null) as number | null,
      link: e.isActive("link"),
      inTable: e.isActive("table"),
      image: e.isActive("image"),
      shape: e.isActive("shape"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      columns: (() => {
        const { $from } = e.state.selection;
        for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "columnSection") return $from.node(d).attrs.count as number;
        return 1;
      })(),
    }),
  });

  const c = () => editor.chain().focus();
  const contextual: { id: TabId; label: string }[] = [];
  if (s.inTable) contextual.push({ id: "table", label: "Table" });
  if (s.image || s.shape) contextual.push({ id: "image", label: s.shape ? "Shape" : "Image" });
  const activeTab = (tab === "table" && !s.inTable) || (tab === "image" && !s.image && !s.shape) ? "home" : tab;

  const tabs: { id: TabId; label: string }[] = [
    { id: "file", label: "File" },
    { id: "home", label: "Home" },
    { id: "insert", label: "Insert" },
    { id: "layout", label: "Layout" },
    { id: "references", label: "References" },
    { id: "review", label: "Review" },
    { id: "view", label: "View" },
    ...contextual,
  ];

  const setBorder = (border: BorderStyle) => c().setParagraphFormat({ border: border === "none" ? null : border }).run();

  const panels: Record<TabId, ReactNode> = {
    file: (
      <>
        <RibbonGroup label="Document">
          {actions.onSaveNow && <RibbonButton large icon={Save} label="Save now" shortcut="Ctrl+S" onClick={actions.onSaveNow} />}
          {actions.onDownload && <RibbonButton large icon={Download} label="Download DOCX" onClick={actions.onDownload} />}
          <RibbonButton large icon={Printer} label="Print / PDF" shortcut="Ctrl+P" onClick={actions.print} />
          {actions.onShowHistory && <RibbonButton large icon={Clock} label="Version history" onClick={actions.onShowHistory} />}
        </RibbonGroup>
        <RibbonGroup label="Setup">
          <RibbonButton large icon={PanelTop} label="Header & footer" onClick={() => actions.openDialog("headerFooter")} />
          <RibbonButton large icon={Ruler} label="Margins" onClick={() => actions.openDialog("margins")} />
        </RibbonGroup>
      </>
    ),
    home: (
      <>
        <RibbonGroup label="Undo">
          <RibbonButton icon={Undo2} label="Undo" shortcut="Ctrl+Z" disabled={!s.canUndo} onClick={() => c().undo().run()} />
          <RibbonButton icon={Redo2} label="Redo" shortcut="Ctrl+Y" disabled={!s.canRedo} onClick={() => c().redo().run()} />
        </RibbonGroup>
        <RibbonGroup label="Font">
          <div className="flex flex-col gap-1">
            <div className="flex gap-1">
              <RibbonSelect label="Font" value={s.font} width={130} options={FONTS.map((f) => ({ value: f, label: f }))} onChange={(f) => c().setFontFamily(f).run()} />
              <RibbonSelect label="Font size" value={s.size} width={58} options={SIZES.map((v) => ({ value: v, label: v }))} onChange={(v) => c().setFontSize(`${v}pt`).run()} />
            </div>
            <div className="flex gap-0.5">
              <RibbonButton icon={Bold} label="Bold" shortcut="Ctrl+B" active={s.bold} onClick={() => c().toggleBold().run()} />
              <RibbonButton icon={Italic} label="Italic" shortcut="Ctrl+I" active={s.italic} onClick={() => c().toggleItalic().run()} />
              <RibbonButton icon={Underline} label="Underline" shortcut="Ctrl+U" active={s.underline} onClick={() => c().toggleUnderline().run()} />
              <RibbonButton icon={Strikethrough} label="Strikethrough" shortcut="Ctrl+Shift+S" active={s.strike} onClick={() => c().toggleStrike().run()} />
              <RibbonButton icon={Superscript} label="Superscript" shortcut="Ctrl+." active={s.sup} onClick={() => c().toggleSuperscript().run()} />
              <RibbonButton icon={Subscript} label="Subscript" shortcut="Ctrl+," active={s.sub} onClick={() => c().toggleSubscript().run()} />
              <Dropdown icon={Baseline} label="Font color" width={190}>
                {(close) => <ColorPalette noneLabel="Automatic" onPick={(color) => (color ? c().setColor(color).run() : c().unsetColor().run(), close())} />}
              </Dropdown>
              <Dropdown icon={Highlighter} label="Highlight" width={190}>
                {(close) => <ColorPalette noneLabel="No highlight" onPick={(color) => (color ? c().setHighlight({ color }).run() : c().unsetHighlight().run(), close())} />}
              </Dropdown>
              <RibbonButton icon={RemoveFormatting} label="Clear formatting" onClick={() => c().unsetAllMarks().setParagraphFormat({ border: null, shading: null }).run()} />
            </div>
          </div>
        </RibbonGroup>
        <RibbonGroup label="Paragraph">
          <div className="flex flex-col gap-1">
            <div className="flex gap-0.5">
              <RibbonButton icon={List} label="Bulleted list" shortcut="Ctrl+Shift+8" active={s.bullet} onClick={() => c().toggleBulletList().run()} />
              <RibbonButton icon={ListOrdered} label="Numbered list" shortcut="Ctrl+Shift+7" active={s.ordered} onClick={() => c().toggleOrderedList().run()} />
              <RibbonButton icon={ListIndentDecrease} label="Decrease indent" shortcut="Shift+Tab" onClick={() => c().changeIndent(-1).run()} />
              <RibbonButton icon={ListIndentIncrease} label="Increase indent" shortcut="Tab" onClick={() => c().changeIndent(1).run()} />
              <Dropdown icon={Pilcrow} label="Line and paragraph spacing" width={210}>
                {(close) => (
                  <div>
                    {LINE_HEIGHTS.map((lh) => (
                      <MenuItem key={lh} label={lh.toFixed(lh % 1 ? 2 : 1).replace(/0$/, "")} active={s.lineHeight === lh} onClick={() => (c().setParagraphFormat({ lineHeight: lh === 1 ? null : lh }).run(), close())} />
                    ))}
                    <hr className="my-1 border-slate-200" />
                    <MenuItem label="Add space before" onClick={() => (c().setParagraphFormat({ spaceBefore: 240 }).run(), close())} />
                    <MenuItem label="Remove space before" onClick={() => (c().setParagraphFormat({ spaceBefore: 0 }).run(), close())} />
                    <MenuItem label="Add space after" onClick={() => (c().setParagraphFormat({ spaceAfter: 240 }).run(), close())} />
                    <MenuItem label="Remove space after" onClick={() => (c().setParagraphFormat({ spaceAfter: 0 }).run(), close())} />
                  </div>
                )}
              </Dropdown>
            </div>
            <div className="flex gap-0.5">
              <RibbonButton icon={TextAlignStart} label="Align left" shortcut="Ctrl+Shift+L" active={s.align === "left"} onClick={() => c().setTextAlign("left").run()} />
              <RibbonButton icon={TextAlignCenter} label="Center" shortcut="Ctrl+Shift+E" active={s.align === "center"} onClick={() => c().setTextAlign("center").run()} />
              <RibbonButton icon={TextAlignEnd} label="Align right" shortcut="Ctrl+Shift+R" active={s.align === "right"} onClick={() => c().setTextAlign("right").run()} />
              <RibbonButton icon={TextAlignJustify} label="Justify" shortcut="Ctrl+Shift+J" active={s.align === "justify"} onClick={() => c().setTextAlign("justify").run()} />
              <Dropdown icon={Square} label="Borders" width={180}>
                {(close) => (
                  <div>
                    {(
                      [
                        ["none", "No border"],
                        ["box", "Box"],
                        ["top", "Top border"],
                        ["bottom", "Bottom border"],
                      ] as [BorderStyle, string][]
                    ).map(([b, label]) => (
                      <MenuItem key={b} label={label} onClick={() => (setBorder(b), close())} />
                    ))}
                  </div>
                )}
              </Dropdown>
              <Dropdown icon={PaintBucket} label="Shading" width={190}>
                {(close) => <ColorPalette noneLabel="No shading" onPick={(color) => (c().setParagraphFormat({ shading: color }).run(), close())} />}
              </Dropdown>
            </div>
          </div>
        </RibbonGroup>
        <RibbonGroup label="Styles">
          <div className="rb-styles" role="listbox" aria-label="Paragraph styles">
            {STYLES.map((st) => (
              <button
                key={st.id}
                type="button"
                role="option"
                aria-selected={s.style === st.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle(editor, st.id)}
                className={`rb-style ${s.style === st.id ? "rb-style-active" : ""}`}
              >
                <span className={st.className}>{st.label}</span>
              </button>
            ))}
          </div>
        </RibbonGroup>
        <RibbonGroup label="Editing">
          <RibbonButton icon={Search} label="Find" shortcut="Ctrl+F" showLabel onClick={() => actions.toggleFind(false)} />
          <RibbonButton icon={Replace} label="Replace" shortcut="Ctrl+H" showLabel onClick={() => actions.toggleFind(true)} />
        </RibbonGroup>
      </>
    ),
    insert: (
      <>
        <RibbonGroup label="Pages">
          <RibbonButton large icon={SeparatorHorizontal} label="Page break" shortcut="Ctrl+Enter" onClick={() => c().setPageBreak().run()} />
        </RibbonGroup>
        <RibbonGroup label="Tables">
          <Dropdown large icon={Table} label="Table" width={180}>
            {(close) => <TableGridPicker onPick={(rows, cols) => (c().insertTable({ rows, cols, withHeaderRow: true }).run(), close())} />}
          </Dropdown>
        </RibbonGroup>
        <RibbonGroup label="Illustrations">
          <RibbonButton large icon={ImageIcon} label="Image" onClick={actions.insertImage} />
          <Dropdown large icon={Shapes} label="Shape" width={200}>
            {(close) => (
              <div>
                {SHAPES.map((sh) => (
                  <MenuItem key={sh.kind} icon={sh.icon} label={sh.label} onClick={() => (c().insertShape({ shape: sh.kind, height: sh.kind === "line" || sh.kind === "arrow" ? 24 : 100 }).run(), close())} />
                ))}
              </div>
            )}
          </Dropdown>
        </RibbonGroup>
        <RibbonGroup label="Links">
          <RibbonButton large icon={Link} label="Link" shortcut="Ctrl+K" active={s.link} onClick={() => actions.openDialog("link")} />
        </RibbonGroup>
        <RibbonGroup label="Text">
          <RibbonButton large icon={Sigma} label="Equation" onClick={() => actions.openDialog("equation")} />
          <RibbonButton large icon={Asterisk} label="Footnote" onClick={() => actions.openDialog("footnote")} />
          <RibbonButton large icon={Minus} label="Horizontal line" onClick={() => c().setHorizontalRule().run()} />
        </RibbonGroup>
        <RibbonGroup label="Header & footer">
          <RibbonButton large icon={PanelTop} label="Header & footer" onClick={() => actions.openDialog("headerFooter")} />
          <RibbonButton large icon={Hash} label="Page numbers" active={actions.page.pageNumbers} onClick={() => actions.setPage({ ...actions.page, pageNumbers: !actions.page.pageNumbers })} />
        </RibbonGroup>
      </>
    ),
    layout: (
      <>
        <RibbonGroup label="Page setup">
          <Dropdown large icon={Ruler} label="Margins" width={220}>
            {(close) => (
              <div>
                {Object.entries(MARGIN_PRESETS).map(([id, preset]) => (
                  <MenuItem
                    key={id}
                    label={preset.label}
                    active={JSON.stringify(preset.margins) === JSON.stringify(actions.page.margins)}
                    onClick={() => (actions.setPage({ ...actions.page, margins: { ...preset.margins } }), close())}
                  />
                ))}
                <hr className="my-1 border-slate-200" />
                <MenuItem label="Custom margins…" onClick={() => (close(), actions.openDialog("margins"))} />
              </div>
            )}
          </Dropdown>
          <Dropdown large icon={actions.page.orientation === "portrait" ? RectangleVertical : RectangleHorizontal} label="Orientation" width={160}>
            {(close) => (
              <div>
                <MenuItem icon={RectangleVertical} label="Portrait" active={actions.page.orientation === "portrait"} onClick={() => (actions.setPage({ ...actions.page, orientation: "portrait" }), close())} />
                <MenuItem icon={RectangleHorizontal} label="Landscape" active={actions.page.orientation === "landscape"} onClick={() => (actions.setPage({ ...actions.page, orientation: "landscape" }), close())} />
              </div>
            )}
          </Dropdown>
          <Dropdown large icon={File} label="Size" width={210}>
            {(close) => (
              <div>
                {(Object.entries(PAPER_SIZES) as [PaperSize, { label: string }][]).map(([id, paper]) => (
                  <MenuItem key={id} label={paper.label} active={actions.page.size === id} onClick={() => (actions.setPage({ ...actions.page, size: id }), close())} />
                ))}
              </div>
            )}
          </Dropdown>
          <Dropdown large icon={Columns2} label="Columns" width={190}>
            {(close) => (
              <div>
                {[1, 2, 3].map((n) => (
                  <MenuItem key={n} label={n === 1 ? "One" : n === 2 ? "Two" : "Three"} active={s.columns === n} onClick={() => (c().setColumns(n).run(), close())} />
                ))}
                <p className="px-2 pt-1 text-xs text-slate-500">Applies to the selected paragraphs.</p>
              </div>
            )}
          </Dropdown>
          <RibbonButton large icon={SeparatorHorizontal} label="Page break" onClick={() => c().setPageBreak().run()} />
        </RibbonGroup>
        <RibbonGroup label="Paragraph">
          <RibbonButton large icon={ListIndentDecrease} label="Decrease indent" onClick={() => c().changeIndent(-1).run()} />
          <RibbonButton large icon={ListIndentIncrease} label="Increase indent" onClick={() => c().changeIndent(1).run()} />
        </RibbonGroup>
        <RibbonGroup label="Header & footer">
          <RibbonButton large icon={PanelTop} label="Header & footer" onClick={() => actions.openDialog("headerFooter")} />
        </RibbonGroup>
      </>
    ),
    references: (
      <>
        <RibbonGroup label="Table of contents">
          <RibbonButton large icon={ListTree} label="Table of contents" onClick={() => c().insertTableOfContents().run()} />
        </RibbonGroup>
        <RibbonGroup label="Footnotes">
          <RibbonButton large icon={Asterisk} label="Insert footnote" onClick={() => actions.openDialog("footnote")} />
        </RibbonGroup>
        <RibbonGroup label="Navigation">
          <RibbonButton large icon={PanelLeft} label="Navigation pane" active={actions.navigationOpen} onClick={actions.toggleNavigation} />
        </RibbonGroup>
      </>
    ),
    review: (
      <>
        <RibbonGroup label="Proofing">
          <RibbonButton large icon={WholeWord} label="Word count" onClick={() => actions.openDialog("wordCount")} />
          <RibbonButton large icon={Search} label="Find" onClick={() => actions.toggleFind(false)} />
          <RibbonButton large icon={Replace} label="Replace" onClick={() => actions.toggleFind(true)} />
        </RibbonGroup>
        {actions.onShowHistory && (
          <RibbonGroup label="Versions">
            <RibbonButton large icon={Clock} label="Version history" onClick={actions.onShowHistory} />
          </RibbonGroup>
        )}
        <div className="self-center px-3 text-xs text-slate-500">Comments and track changes arrive with the collaboration release.</div>
      </>
    ),
    view: (
      <>
        <RibbonGroup label="Show">
          <RibbonButton large icon={PanelLeft} label="Navigation pane" active={actions.navigationOpen} onClick={actions.toggleNavigation} />
        </RibbonGroup>
        <RibbonGroup label="Zoom">
          <RibbonButton large icon={ZoomOut} label="Zoom out" onClick={() => actions.setZoom(Math.max(0.5, Math.round((actions.zoom - 0.1) * 10) / 10))} />
          <RibbonButton large icon={Heading} label="100%" onClick={() => actions.setZoom(1)} />
          <RibbonButton large icon={ZoomIn} label="Zoom in" onClick={() => actions.setZoom(Math.min(2, Math.round((actions.zoom + 0.1) * 10) / 10))} />
        </RibbonGroup>
        <RibbonGroup label="Help">
          <RibbonButton large icon={Keyboard} label="Shortcuts" onClick={() => actions.openDialog("shortcuts")} />
        </RibbonGroup>
      </>
    ),
    table: (
      <>
        <RibbonGroup label="Rows & columns">
          <RibbonButton large icon={BetweenHorizontalStart} label="Insert above" onClick={() => c().addRowBefore().run()} />
          <RibbonButton large icon={BetweenHorizontalEnd} label="Insert below" onClick={() => c().addRowAfter().run()} />
          <RibbonButton large icon={BetweenVerticalStart} label="Insert left" onClick={() => c().addColumnBefore().run()} />
          <RibbonButton large icon={BetweenVerticalEnd} label="Insert right" onClick={() => c().addColumnAfter().run()} />
        </RibbonGroup>
        <RibbonGroup label="Delete">
          <RibbonButton large icon={Trash} label="Delete row" onClick={() => c().deleteRow().run()} />
          <RibbonButton large icon={Trash} label="Delete column" onClick={() => c().deleteColumn().run()} />
          <RibbonButton large icon={Trash} label="Delete table" onClick={() => c().deleteTable().run()} />
        </RibbonGroup>
        <RibbonGroup label="Merge">
          <RibbonButton large icon={TableCellsMerge} label="Merge cells" onClick={() => c().mergeCells().run()} />
          <RibbonButton large icon={TableCellsSplit} label="Split cell" onClick={() => c().splitCell().run()} />
          <RibbonButton large icon={Heading} label="Header row" onClick={() => c().toggleHeaderRow().run()} />
        </RibbonGroup>
      </>
    ),
    image: <ObjectPanel editor={editor} shape={s.shape} />,
  };

  return (
    <div className="rb-root">
      <div role="tablist" aria-label="Ribbon" className="rb-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`rb-tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls="rb-panel"
            onClick={() => setTab(t.id)}
            className={`rb-tab ${activeTab === t.id ? "rb-tab-active" : ""} ${t.id === "table" || t.id === "image" ? "rb-tab-contextual" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="rb-panel" role="tabpanel" aria-labelledby={`rb-tab-${activeTab}`} className="rb-panel">
        {panels[activeTab]}
      </div>
    </div>
  );
}

function ObjectPanel({ editor, shape }: { editor: Editor; shape: boolean }) {
  const type = shape ? "shape" : "image";
  const attrs = editor.getAttributes(type);
  const width = Number(attrs.width) || 0;
  const height = Number(attrs.height) || 0;
  const setSize = (w: number) => {
    if (!w || w < 8) return;
    const ratio = width && height ? height / width : 0.75;
    editor.chain().focus().updateAttributes(type, { width: Math.round(w), height: shape ? height : Math.round(w * ratio) }).run();
  };
  return (
    <>
      <RibbonGroup label="Size">
        <label className="flex items-center gap-2 text-xs">
          Width (px)
          <input key={width} type="number" min={8} max={1200} defaultValue={width || ""} className="rb-select w-20" onKeyDown={(e) => e.key === "Enter" && setSize(Number(e.currentTarget.value))} onBlur={(e) => setSize(Number(e.currentTarget.value))} />
        </label>
        {shape && (
          <label className="flex items-center gap-2 text-xs">
            Height (px)
            <input
              key={`h${height}`}
              type="number"
              min={2}
              max={1200}
              defaultValue={height || ""}
              className="rb-select w-20"
              onBlur={(e) => Number(e.currentTarget.value) > 1 && editor.chain().focus().updateAttributes("shape", { height: Number(e.currentTarget.value) }).run()}
            />
          </label>
        )}
      </RibbonGroup>
      {shape ? (
        <RibbonGroup label="Style">
          <Dropdown icon={PaintBucket} label="Fill" showLabel width={190}>
            {(close) => <ColorPalette noneLabel="No fill" onPick={(color) => (editor.chain().focus().updateAttributes("shape", { fill: color ?? "none" }).run(), close())} />}
          </Dropdown>
          <Dropdown icon={Baseline} label="Outline" showLabel width={190}>
            {(close) => <ColorPalette noneLabel="No outline" onPick={(color) => (editor.chain().focus().updateAttributes("shape", { stroke: color ?? "none" }).run(), close())} />}
          </Dropdown>
        </RibbonGroup>
      ) : (
        <RibbonGroup label="Accessibility">
          <label className="flex items-center gap-2 text-xs">
            Alt text
            <input
              key={String(attrs.alt)}
              defaultValue={(attrs.alt as string | null) ?? ""}
              className="rb-select w-48"
              placeholder="Describe the image"
              onBlur={(e) => editor.chain().updateAttributes("image", { alt: e.currentTarget.value || null }).run()}
            />
          </label>
        </RibbonGroup>
      )}
      <RibbonGroup label="Arrange">
        <RibbonButton large icon={Trash} label="Delete" onClick={() => editor.chain().focus().deleteSelection().run()} />
      </RibbonGroup>
    </>
  );
}
