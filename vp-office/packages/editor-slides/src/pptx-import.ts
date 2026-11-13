import JSZip from "jszip";
import { EMBED_PATH, slidesHash } from "./pptx-export";
import { newId, type Deck, type Paragraph, type ShapeElement, type Slide, type SlideElement, type TextBody, type TextRun } from "./model";

const EMU = 914400;
const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" };

type El = Element;
const kids = (el: El | null | undefined, name?: string): El[] => (el ? Array.from(el.children).filter((c) => !name || c.localName === name) : []);
const kid = (el: El | null | undefined, name: string) => kids(el, name)[0];
const path = (el: El | null | undefined, ...names: string[]) => names.reduce<El | undefined>((e, n) => kid(e, n), el ?? undefined);
const num = (v: string | null | undefined) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const all = (el: El, name: string) => Array.from(el.getElementsByTagName("*")).filter((e) => e.localName === name);

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function resolvePath(from: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

interface Part {
  path: string;
  doc: Document;
  rels: Map<string, { target: string; type: string }>;
}

async function part(zip: JSZip, p: string): Promise<Part | null> {
  const file = zip.file(p);
  if (!file) return null;
  const doc = new DOMParser().parseFromString(await file.async("string"), "application/xml");
  const rels = new Map<string, { target: string; type: string }>();
  const relPath = p.replace(/([^/]+)$/, "_rels/$1.rels");
  const relFile = zip.file(relPath);
  if (relFile) {
    const relDoc = new DOMParser().parseFromString(await relFile.async("string"), "application/xml");
    for (const r of Array.from(relDoc.getElementsByTagName("Relationship"))) {
      if (r.getAttribute("TargetMode") === "External") continue;
      rels.set(r.getAttribute("Id") ?? "", { target: resolvePath(p, r.getAttribute("Target") ?? ""), type: r.getAttribute("Type") ?? "" });
    }
  }
  return { path: p, doc, rels };
}

const relOfType = (p: Part, suffix: string) => [...p.rels.values()].find((r) => r.type.endsWith(suffix))?.target;

interface Xfrm {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

function readXfrm(x: El | undefined): Xfrm | null {
  const off = kid(x, "off");
  const ext = kid(x, "ext");
  if (!off || !ext) return null;
  return {
    x: (num(off.getAttribute("x")) ?? 0) / EMU,
    y: (num(off.getAttribute("y")) ?? 0) / EMU,
    w: (num(ext.getAttribute("cx")) ?? 0) / EMU,
    h: (num(ext.getAttribute("cy")) ?? 0) / EMU,
    rot: (num(x?.getAttribute("rot")) ?? 0) / 60000,
  };
}

type Transform = (x: Xfrm) => Xfrm;
const identity: Transform = (x) => x;

interface Ctx {
  zip: JSZip;
  colors: Record<string, string>;
  warnings: Set<string>;
}

function color(ctx: Ctx, fillParent: El | undefined): string | null | undefined {
  if (!fillParent) return undefined;
  if (kid(fillParent, "noFill")) return null;
  const solid = kid(fillParent, "solidFill");
  if (!solid) return undefined;
  const srgb = kid(solid, "srgbClr")?.getAttribute("val");
  if (srgb) return `#${srgb.toLowerCase()}`;
  const scheme = kid(solid, "schemeClr")?.getAttribute("val");
  if (scheme) {
    const alias: Record<string, string> = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" };
    return ctx.colors[alias[scheme] ?? scheme];
  }
  const sys = kid(solid, "sysClr")?.getAttribute("lastClr");
  return sys ? `#${sys.toLowerCase()}` : undefined;
}

function readText(ctx: Ctx, txBody: El | undefined, defaults: { size: number; bullet: boolean }): TextBody | undefined {
  if (!txBody) return undefined;
  const anchor = kid(txBody, "bodyPr")?.getAttribute("anchor");
  const paragraphs: Paragraph[] = kids(txBody, "p").map((p) => {
    const pPr = kid(p, "pPr");
    const algn = pPr?.getAttribute("algn");
    const align = algn === "ctr" ? "center" : algn === "r" ? "right" : algn === "just" ? "justify" : algn === "l" ? "left" : undefined;
    const level = num(pPr?.getAttribute("lvl")) ?? 0;
    const bullet = kid(pPr, "buNone") ? false : kid(pPr, "buChar") || kid(pPr, "buAutoNum") ? true : defaults.bullet;
    const runs: TextRun[] = [];
    for (const child of kids(p)) {
      if (child.localName === "r" || child.localName === "fld") {
        const rPr = kid(child, "rPr");
        const sz = num(rPr?.getAttribute("sz"));
        const c = color(ctx, rPr);
        const font = kid(rPr, "latin")?.getAttribute("typeface");
        runs.push({
          text: kid(child, "t")?.textContent ?? "",
          ...(rPr?.getAttribute("b") === "1" ? { bold: true } : {}),
          ...(rPr?.getAttribute("i") === "1" ? { italic: true } : {}),
          ...(rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none" ? { underline: true } : {}),
          ...(c ? { color: c } : {}),
          size: sz ? sz / 100 : defaults.size,
          ...(font && !font.startsWith("+") ? { font } : {}),
        });
      } else if (child.localName === "br") runs.push({ text: "\n" });
    }
    return { runs, ...(align ? { align } : {}), ...(bullet ? { bullet: true } : {}), ...(level ? { level } : {}) };
  });
  const valign = anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : undefined;
  return { paragraphs, ...(valign ? { valign } : {}) };
}

interface Placeholder {
  type: string;
  idx: string | null;
  xfrm: Xfrm | null;
}

function placeholders(p: Part | null): Placeholder[] {
  if (!p) return [];
  return all(p.doc.documentElement, "sp").flatMap((sp) => {
    const ph = path(sp, "nvSpPr", "nvPr", "ph");
    if (!ph) return [];
    return [{ type: ph.getAttribute("type") ?? "body", idx: ph.getAttribute("idx"), xfrm: readXfrm(path(sp, "spPr", "xfrm")) }];
  });
}

function findPlaceholder(lists: Placeholder[][], type: string, idx: string | null): Xfrm | null {
  const norm = (t: string) => (t === "ctrTitle" ? "title" : t === "obj" ? "body" : t);
  for (const list of lists) {
    const byIdx = idx !== null ? list.find((p) => p.idx === idx && p.xfrm) : undefined;
    const byType = list.find((p) => norm(p.type) === norm(type) && p.xfrm);
    const hit = byIdx ?? byType;
    if (hit?.xfrm) return hit.xfrm;
  }
  return null;
}

const PRESET: Record<string, ShapeElement["shape"]> = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  triangle: "triangle",
  line: "line",
  straightConnector1: "line",
  rightArrow: "arrow",
};

async function imageSrc(ctx: Ctx, slide: Part, rid: string | null): Promise<string | null> {
  const target = rid ? slide.rels.get(rid)?.target : undefined;
  const ext = target?.split(".").pop()?.toLowerCase() ?? "";
  const file = target ? ctx.zip.file(target) : null;
  if (!file || !IMAGE_MIME[ext]) {
    ctx.warnings.add("Some images use formats that aren't supported (for example EMF, WMF or SVG) and were removed.");
    return null;
  }
  return `data:${IMAGE_MIME[ext]};base64,${toBase64(await file.async("uint8array"))}`;
}

async function readShapes(ctx: Ctx, slide: Part, tree: El, phLists: Placeholder[][], transform: Transform, groupId: string | undefined, out: SlideElement[]): Promise<void> {
  for (const node of kids(tree)) {
    const base = groupId ? { groupId } : {};
    switch (node.localName) {
      case "sp":
      case "cxnSp": {
        const ph = path(node, node.localName === "sp" ? "nvSpPr" : "nvCxnSpPr", "nvPr", "ph");
        const spPr = kid(node, "spPr");
        let xfrm = readXfrm(kid(spPr, "xfrm"));
        if (!xfrm && ph) xfrm = findPlaceholder(phLists, ph.getAttribute("type") ?? "body", ph.getAttribute("idx"));
        if (!xfrm) continue;
        const t = transform(xfrm);
        const box = { id: newId(), x: t.x, y: t.y, w: Math.max(t.w, 0.05), h: Math.max(t.h, 0.02), ...(t.rot ? { rotation: t.rot } : {}), ...base };
        const type = ph?.getAttribute("type") ?? (ph ? "body" : null);
        const role = type === "title" || type === "ctrTitle" ? "title" : type === "subTitle" ? "subtitle" : type ? "body" : undefined;
        const body = readText(ctx, kid(node, "txBody"), { size: role === "title" ? 32 : role ? 20 : 18, bullet: role === "body" && type !== "sldNum" && type !== "ftr" && type !== "dt" });
        const hasText = !!body?.paragraphs.some((p) => p.runs.some((r) => r.text.trim()));
        if (type === "sldNum" || type === "dt" || type === "ftr") continue;
        const geom = kid(spPr, "prstGeom")?.getAttribute("prst");
        if (kid(spPr, "custGeom")) ctx.warnings.add("Freeform shapes were simplified to rectangles.");
        const fill = color(ctx, spPr);
        const ln = kid(spPr, "ln");
        const stroke = color(ctx, ln);
        // A rectangle with no visible fill or outline holding text is a text box.
        const invisible = !fill && !stroke && !kid(node, "style");
        const isTextBox = role !== undefined || path(node, "nvSpPr", "cNvSpPr")?.getAttribute("txBox") === "1" || (invisible && hasText && (!geom || geom === "rect"));
        if (isTextBox && geom !== "line") {
          if (!hasText) continue;
          out.push({ ...box, kind: "text", body: body!, ...(role ? { role } : {}) } as SlideElement);
        } else {
          const shape: ShapeElement["shape"] = (geom ? PRESET[geom] : undefined) ?? (node.localName === "cxnSp" ? "line" : "rect");
          if (geom && !PRESET[geom]) ctx.warnings.add("Some shape types were simplified to rectangles.");
          out.push({
            ...box,
            kind: "shape",
            shape,
            fill: fill === undefined ? (shape === "line" || shape === "arrow" ? null : "#dbeafe") : fill,
            stroke: stroke === undefined ? "#1e3a5f" : stroke,
            strokeWidth: (num(ln?.getAttribute("w")) ?? 12700) / 12700,
            ...(hasText ? { body } : {}),
          });
        }
        break;
      }
      case "pic": {
        if (all(node, "videoFile").length || all(node, "audioFile").length) ctx.warnings.add("Video and audio were removed.");
        const xfrm = readXfrm(path(node, "spPr", "xfrm"));
        const src = await imageSrc(ctx, slide, all(node, "blip")[0]?.getAttribute("r:embed") ?? null);
        if (!xfrm || !src) continue;
        const t = transform(xfrm);
        const alt = path(node, "nvPicPr", "cNvPr")?.getAttribute("descr");
        out.push({ id: newId(), kind: "image", x: t.x, y: t.y, w: t.w, h: t.h, src, ...(alt ? { alt } : {}), ...(t.rot ? { rotation: t.rot } : {}), ...base });
        break;
      }
      case "graphicFrame": {
        const uri = all(node, "graphicData")[0]?.getAttribute("uri") ?? "";
        const xfrm = readXfrm(kid(node, "xfrm"));
        if (uri.includes("table") && xfrm) {
          const rows = all(node, "tr").map((tr) => kids(tr, "tc").map((tc) => all(tc, "t").map((t) => t.textContent ?? "").join("")));
          const t = transform(xfrm);
          out.push({ id: newId(), kind: "table", x: t.x, y: t.y, w: t.w, h: t.h, rows, header: true, ...base });
        } else if (uri.includes("chart")) ctx.warnings.add("Charts aren't supported yet and were removed.");
        else if (uri.includes("diagram")) ctx.warnings.add("SmartArt diagrams aren't supported and were removed.");
        else ctx.warnings.add("Embedded objects were removed.");
        break;
      }
      case "grpSp": {
        const gx = path(node, "grpSpPr", "xfrm");
        const off = readXfrm(gx);
        const chOff = kid(gx, "chOff");
        const chExt = kid(gx, "chExt");
        let inner = transform;
        if (off && chOff && chExt) {
          const cx = (num(chOff.getAttribute("x")) ?? 0) / EMU;
          const cy = (num(chOff.getAttribute("y")) ?? 0) / EMU;
          const cw = (num(chExt.getAttribute("cx")) ?? 1) / EMU || 1;
          const ch = (num(chExt.getAttribute("cy")) ?? 1) / EMU || 1;
          const sx = off.w / cw;
          const sy = off.h / ch;
          inner = (x) => transform({ x: off.x + (x.x - cx) * sx, y: off.y + (x.y - cy) * sy, w: x.w * sx, h: x.h * sy, rot: x.rot });
        }
        await readShapes(ctx, slide, node, phLists, inner, groupId ?? newId(), out);
        break;
      }
    }
  }
}

async function readTheme(zip: JSZip, master: Part | null): Promise<Record<string, string>> {
  const themePath = master ? relOfType(master, "/theme") : undefined;
  const theme = await part(zip, themePath ?? "ppt/theme/theme1.xml");
  const colors: Record<string, string> = {};
  const scheme = theme ? all(theme.doc.documentElement, "clrScheme")[0] : undefined;
  for (const c of kids(scheme)) {
    const v = kid(c, "srgbClr")?.getAttribute("val") ?? kid(c, "sysClr")?.getAttribute("lastClr");
    if (v) colors[c.localName] = `#${v.toLowerCase()}`;
  }
  return colors;
}

export interface SlidesImportResult {
  deck: Deck;
  warnings: string[];
  fromEmbedded: boolean;
}

/** Imports PPTX bytes. Presentations saved here reopen from their embedded deck. */
export async function importPptx(bytes: Uint8Array): Promise<SlidesImportResult> {
  const zip = await JSZip.loadAsync(bytes);
  const embedded = zip.file(EMBED_PATH);
  if (embedded) {
    try {
      const parsed = JSON.parse(await embedded.async("string")) as { hash?: string; deck?: Deck };
      if (parsed.deck?.version === 1 && parsed.hash === (await slidesHash(zip))) return { deck: parsed.deck, warnings: [], fromEmbedded: true };
    } catch {
      // Fall back to the slide XML.
    }
  }
  const pres = await part(zip, "ppt/presentation.xml");
  if (!pres) throw new Error("This file has no presentation part.");
  const size = kid(pres.doc.documentElement, "sldSz");
  const deck: Deck = {
    version: 1,
    width: (num(size?.getAttribute("cx")) ?? 12192000) / EMU,
    height: (num(size?.getAttribute("cy")) ?? 6858000) / EMU,
    theme: "light",
    slides: [],
  };
  const warnings = new Set<string>();
  const ids = kids(kid(pres.doc.documentElement, "sldIdLst"), "sldId");
  for (const sldId of ids) {
    const target = pres.rels.get(sldId.getAttribute("r:id") ?? "")?.target;
    const slide = target ? await part(zip, target) : null;
    if (!slide) continue;
    const layout = await part(zip, relOfType(slide, "/slideLayout") ?? "");
    const master = layout ? await part(zip, relOfType(layout, "/slideMaster") ?? "") : null;
    const ctx: Ctx = { zip, colors: await readTheme(zip, master), warnings };
    const root = slide.doc.documentElement;
    if (kid(root, "transition") || kid(root, "timing")) warnings.add("Transitions and animations were removed.");
    const bgOf = (p: Part | null) => (p ? color(ctx, path(p.doc.documentElement, "cSld", "bg", "bgPr")) : undefined);
    const background = bgOf(slide) ?? bgOf(layout) ?? bgOf(master) ?? undefined;
    const elements: SlideElement[] = [];
    const tree = path(root, "cSld", "spTree");
    if (tree) await readShapes(ctx, slide, tree, [placeholders(layout), placeholders(master)], identity, undefined, elements);
    let notes = "";
    const notesPart = await part(zip, relOfType(slide, "/notesSlide") ?? "");
    if (notesPart) {
      const body = all(notesPart.doc.documentElement, "sp").find((sp) => path(sp, "nvSpPr", "nvPr", "ph")?.getAttribute("type") === "body");
      notes = body ? kids(kid(body, "txBody"), "p").map((p) => all(p, "t").map((t) => t.textContent ?? "").join("")).join("\n").trim() : "";
    }
    const hasTitle = elements.some((e) => e.kind === "text" && e.role === "title");
    const s: Slide = {
      id: newId(),
      layout: hasTitle ? (elements.some((e) => e.kind === "text" && e.role === "subtitle") ? "title" : "titleContent") : "blank",
      elements,
      notes,
      background: background ?? "#ffffff",
      ...(root.getAttribute("show") === "0" ? { hidden: true } : {}),
    };
    deck.slides.push(s);
  }
  if (deck.slides.length === 0) throw new Error("This presentation has no slides.");
  return { deck, warnings: [...warnings], fromEmbedded: false };
}
