import {
  degrees,
  EncryptedPDFError,
  PDFArray,
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFSignature,
  PDFString,
  PDFTextField,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
  rgb,
  type PDFFont,
  type PDFPage,
} from "@cantoo/pdf-lib";
import { findShowOps, opsForTarget, removeShowOps, type FontMetrics, type ShowOp } from "./content-stream";
import {
  hexToRgb,
  initialState,
  type FormFieldInfo,
  type FormFieldType,
  type FormValue,
  type PdfAnnotation,
  type PdfEditState,
  type PdfRect,
  type TextEdit,
  textRunRect,
} from "./model";

/** Custom key on annotation dictionaries holding our editable source. */
const OCTO_KEY = PDFName.of("OctoData");
const AUTHOR = "OctoGenie Office";

export interface PreparedPdf {
  /** The document without our own annotations; the editor renders this. */
  base: Uint8Array;
  state: PdfEditState;
  pageCount: number;
  fields: FormFieldInfo[];
  /** Password-protected or encrypted: viewable, not editable. */
  encrypted: boolean;
  warnings: string[];
}

function pageAnnots(page: PDFPage): PDFArray | undefined {
  return page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
}

function textOf(value: unknown): string | undefined {
  if (value instanceof PDFHexString || value instanceof PDFString) return value.decodeText();
  return undefined;
}

function readFields(doc: PDFDocument, warnings: Set<string>): FormFieldInfo[] {
  let form;
  try {
    form = doc.getForm();
  } catch {
    return [];
  }
  const pageIndex = new Map<string, number>();
  doc.getPages().forEach((p, i) => pageIndex.set(p.ref.toString(), i));
  // Widgets without a /P entry: find their page by scanning annotation arrays.
  const widgetPage = new Map<string, number>();
  doc.getPages().forEach((p, i) => {
    const annots = pageAnnots(p);
    annots?.asArray().forEach((ref) => ref instanceof PDFRef && widgetPage.set(ref.toString(), i));
  });

  const fields: FormFieldInfo[] = [];
  for (const field of form.getFields()) {
    let type: FormFieldType;
    let value: FormValue = "";
    let options: string[] = [];
    let multiline = false;
    let maxLength: number | undefined;
    if (field instanceof PDFTextField) {
      type = "text";
      value = field.getText() ?? "";
      multiline = field.isMultiline();
      maxLength = field.getMaxLength();
    } else if (field instanceof PDFCheckBox) {
      type = "checkbox";
      value = field.isChecked();
    } else if (field instanceof PDFRadioGroup) {
      type = "radio";
      value = field.getSelected() ?? "";
      options = field.getOptions();
    } else if (field instanceof PDFDropdown) {
      type = "dropdown";
      value = field.getSelected()[0] ?? "";
      options = field.getOptions();
    } else if (field instanceof PDFOptionList) {
      type = "optionlist";
      value = field.getSelected();
      options = field.getOptions();
    } else if (field instanceof PDFSignature) {
      type = "signature";
      warnings.add("Digital signature fields can't be signed here. Use the Signature tool to add a visible signature.");
    } else if (field instanceof PDFButton) {
      type = "button";
    } else continue;

    const widgets = field.acroField.getWidgets().map((widget, i) => {
      const r = widget.getRectangle();
      const pRef = widget.P();
      const ref = doc.context.getObjectRef(widget.dict);
      const page = (pRef && pageIndex.get(pRef.toString())) ?? (ref ? widgetPage.get(ref.toString()) : undefined) ?? 0;
      const exportValue = type === "radio" ? options[i] : type === "checkbox" ? "Yes" : undefined;
      return { page, rect: [r.x, r.y, r.x + r.width, r.y + r.height] as PdfRect, ...(exportValue !== undefined ? { exportValue } : {}) };
    });
    fields.push({ name: field.getName(), type, widgets, value, options, multiline, readOnly: field.isReadOnly(), ...(maxLength !== undefined ? { maxLength } : {}) });
  }
  return fields;
}

/**
 * Loads a PDF for editing: lifts our own annotations back into editable
 * state and returns the document without them for rendering.
 */
export async function preparePdf(bytes: Uint8Array): Promise<PreparedPdf> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      return { base: bytes, state: initialState(0), pageCount: 0, fields: [], encrypted: true, warnings: ["This PDF is encrypted. It can be viewed but not edited."] };
    }
    throw error;
  }
  const warnings = new Set<string>();
  const annotations: PdfAnnotation[] = [];
  doc.getPages().forEach((page, index) => {
    const annots = pageAnnots(page);
    if (!annots) return;
    const keep: PDFRef[] = [];
    for (const item of annots.asArray()) {
      const dict = item instanceof PDFRef ? doc.context.lookupMaybe(item, PDFDict) : item instanceof PDFDict ? item : undefined;
      const source = dict && textOf(dict.get(OCTO_KEY));
      if (dict && source) {
        try {
          const annotation = JSON.parse(source) as PdfAnnotation;
          annotations.push({ ...annotation, page: index });
          if (item instanceof PDFRef) doc.context.delete(item);
          continue;
        } catch {
          // Corrupt source: leave the annotation as an ordinary one.
        }
      }
      if (item instanceof PDFRef) keep.push(item);
    }
    page.node.set(PDFName.of("Annots"), doc.context.obj(keep));
  });

  const fields = readFields(doc, warnings);
  if (doc.catalog.has(PDFName.of("Names")) && doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict)?.has(PDFName.of("JavaScript"))) {
    warnings.add("This PDF contains scripts. They are never run here.");
  }
  const base = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  const state = initialState(doc.getPageCount());
  state.annotations = annotations;
  return { base, state, pageCount: doc.getPageCount(), fields, encrypted: false, warnings: [...warnings] };
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

/** Escapes text for a PDF literal string in WinAnsi encoding. */
function pdfLiteral(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (code >= 32 && code < 127) out += ch;
    else if (code >= 160 && code <= 255) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return out;
}

function wrap(text: string, fontSize: number, width: number): string[] {
  // Helvetica averages ~0.5em per character.
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.5)));
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!line) line = word;
      else if ((line + " " + word).length <= perLine) line += " " + word;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

async function appearance(doc: PDFDocument, a: PdfAnnotation): Promise<PDFRef> {
  const ctx = doc.context;
  const [x1, y1, x2, y2] = a.rect;
  const [r, g, b] = hexToRgb(a.color);
  const color = `${num(r)} ${num(g)} ${num(b)}`;
  const resources: Record<string, unknown> = {};
  let ops = "";
  switch (a.kind) {
    case "highlight":
      resources.ExtGState = { GS0: ctx.obj({ Type: "ExtGState", CA: PDFNumber.of(0.4), ca: PDFNumber.of(0.4), BM: "Multiply" }) };
      ops = `/GS0 gs ${color} rg ` + a.rects.map(([a1, b1, a2, b2]) => `${num(a1)} ${num(b1)} ${num(a2 - a1)} ${num(b2 - b1)} re f`).join(" ");
      break;
    case "ink":
      ops = `${color} RG ${num(a.width)} w 1 J 1 j ` + a.paths.map((path) => path.map(([x, y], i) => `${num(x)} ${num(y)} ${i === 0 ? "m" : "l"}`).join(" ") + " S").join(" ");
      break;
    case "note":
      ops = `${color} rg 0.4 0.3 0 RG 1 w ${num(x1 + 0.5)} ${num(y1 + 0.5)} ${num(x2 - x1 - 1)} ${num(y2 - y1 - 1)} re B 0.4 0.3 0 RG ${num(x1 + 4)} ${num(y2 - 6)} m ${num(x2 - 4)} ${num(y2 - 6)} l ${num(x1 + 4)} ${num(y2 - 10)} m ${num(x2 - 4)} ${num(y2 - 10)} l ${num(x1 + 4)} ${num(y2 - 14)} m ${num(x2 - 7)} ${num(y2 - 14)} l S`;
      break;
    case "text": {
      resources.Font = { F1: ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" }) };
      const lines = wrap(a.text, a.fontSize, x2 - x1 - 4);
      const leading = a.fontSize * 1.2;
      ops = `BT /F1 ${num(a.fontSize)} Tf ${color} rg ${num(leading)} TL ${num(x1 + 2)} ${num(y2 - a.fontSize - 1)} Td ` + lines.map((l) => `(${pdfLiteral(l)}) Tj T*`).join(" ") + " ET";
      break;
    }
    case "signature": {
      const match = /^data:image\/png;base64,(.*)$/.exec(a.image);
      if (match) {
        const image = await doc.embedPng(Uint8Array.from(atob(match[1]!), (c) => c.charCodeAt(0)));
        resources.XObject = { Im0: image.ref };
        ops = `q ${num(x2 - x1)} 0 0 ${num(y2 - y1)} ${num(x1)} ${num(y1)} cm /Im0 Do Q`;
      }
      break;
    }
  }
  const stream = ctx.stream(ops, { Type: "XObject", Subtype: "Form", BBox: [x1, y1, x2, y2], Resources: ctx.obj(resources as never) });
  return ctx.register(stream);
}

const SUBTYPE: Record<PdfAnnotation["kind"], string> = { highlight: "Highlight", note: "Text", ink: "Ink", text: "FreeText", signature: "Stamp" };

async function writeAnnotation(doc: PDFDocument, page: PDFPage, a: PdfAnnotation): Promise<void> {
  const ctx = doc.context;
  const [r, g, b] = hexToRgb(a.color);
  const entries: Record<string, unknown> = {
    Type: "Annot",
    Subtype: SUBTYPE[a.kind],
    Rect: a.rect,
    C: [r, g, b],
    F: PDFNumber.of(4),
    T: PDFHexString.fromText(a.author || AUTHOR),
    NM: PDFHexString.fromText(a.id),
    M: PDFString.fromDate(new Date(a.createdAt)),
    Contents: PDFHexString.fromText(a.kind === "text" ? a.text : a.comment),
    AP: ctx.obj({ N: await appearance(doc, a) }),
  };
  if (a.kind === "highlight") {
    entries.QuadPoints = a.rects.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1]);
    entries.CA = PDFNumber.of(0.4);
  }
  if (a.kind === "ink") {
    entries.InkList = a.paths.map((path) => path.flat());
    entries.BS = ctx.obj({ W: PDFNumber.of(a.width) });
  }
  if (a.kind === "note") {
    entries.Name = "Comment";
    entries.Open = false;
  }
  if (a.kind === "text") entries.DA = PDFString.of(`/Helv ${a.fontSize} Tf ${r} ${g} ${b} rg`);
  if (a.kind === "signature") entries.Name = "Signature";
  const dict = ctx.obj(entries as never) as unknown as PDFDict;
  dict.set(OCTO_KEY, PDFHexString.fromText(JSON.stringify(a)));
  page.node.addAnnot(ctx.register(dict));
}

function applyFormValues(doc: PDFDocument, values: Record<string, FormValue>): void {
  if (!Object.keys(values).length) return;
  const form = doc.getForm();
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    if (!field || field.isReadOnly()) continue;
    if (field instanceof PDFTextField && typeof value === "string") field.setText(field.getMaxLength() ? value.slice(0, field.getMaxLength()) : value);
    else if (field instanceof PDFCheckBox) (value === true ? field.check() : field.uncheck());
    else if (field instanceof PDFRadioGroup && typeof value === "string") (value ? field.select(value) : field.clear());
    else if (field instanceof PDFDropdown && typeof value === "string") (value ? field.select(value) : field.clear());
    else if (field instanceof PDFOptionList && Array.isArray(value)) field.select(value);
  }
}

/** Produces the saved PDF from the base document and the edit state. */
export interface BuildReport {
  /** Pages (1-based, original order) where some original text could only be covered, not removed. */
  coveredPages: number[];
}

export async function buildPdf(base: Uint8Array, state: PdfEditState, report?: BuildReport): Promise<Uint8Array> {
  const doc = await PDFDocument.load(base, { updateMetadata: false });
  applyFormValues(doc, state.formValues);
  if (state.textEdits?.length) await applyTextEdits(doc, state.textEdits, report);

  const original = doc.getPages();
  // Annotations go onto their source pages before pages move.
  for (const a of state.annotations) {
    const page = original[a.page];
    if (page && state.pages.some((p) => p.source === a.page)) await writeAnnotation(doc, page, a);
  }
  for (const entry of state.pages) {
    const page = original[entry.source];
    if (page && entry.rotation) page.setRotation(degrees((page.getRotation().angle + entry.rotation) % 360));
  }
  if (state.pages.length !== original.length || state.pages.some((p, i) => p.source !== i)) reorderPages(doc, original, state.pages.map((p) => p.source));
  return doc.save({ useObjectStreams: false, updateFieldAppearances: Object.keys(state.formValues).length > 0 });
}

const INHERITABLE = ["Resources", "MediaBox", "CropBox", "Rotate"].map((k) => PDFName.of(k));

/**
 * Rebuilds the page tree as one flat list in the new order. Page objects are
 * kept (so form widgets stay linked); deleted pages and their content
 * streams are removed from the file so their text doesn't linger.
 */
function reorderPages(doc: PDFDocument, original: PDFPage[], order: number[]): void {
  const ctx = doc.context;
  const rootRef = doc.catalog.get(PDFName.of("Pages")) as PDFRef;
  const root = doc.catalog.Pages();
  for (const page of original) {
    for (const key of INHERITABLE) {
      if (!page.node.get(key)) {
        const inherited = page.node.getInheritableAttribute(key);
        if (inherited) page.node.set(key, inherited);
      }
    }
  }
  const keep = new Set(order);
  original.forEach((page, i) => {
    if (keep.has(i)) return;
    const contents = page.node.get(PDFName.of("Contents"));
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    for (const s of streams) if (s instanceof PDFRef) ctx.delete(s);
    ctx.delete(page.ref);
  });
  // Drop intermediate page-tree nodes; every kept page now hangs off the root.
  const stack = [...(root.Kids().asArray() as PDFRef[])];
  while (stack.length) {
    const ref = stack.pop()!;
    const node = ctx.lookupMaybe(ref, PDFDict);
    if (node?.get(PDFName.of("Type"))?.toString() === "/Pages") {
      stack.push(...((node.lookupMaybe(PDFName.of("Kids"), PDFArray)?.asArray() ?? []) as PDFRef[]));
      ctx.delete(ref);
    }
  }
  const refs = order.map((i) => original[i]!.ref);
  for (const i of order) original[i]!.node.set(PDFName.of("Parent"), rootRef);
  root.set(PDFName.of("Kids"), ctx.obj(refs));
  root.set(PDFName.of("Count"), PDFNumber.of(refs.length));
}


// ---------------------------------------------------------------------------
// Editing the PDF's own text

function fontMetrics(doc: PDFDocument, fontDict: PDFDict | undefined): FontMetrics | null {
  if (!fontDict) return null;
  const subtype = fontDict.get(PDFName.of("Subtype"))?.toString();
  if (subtype === "/Type0") {
    const descendants = fontDict.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
    const cid = descendants ? doc.context.lookupMaybe(descendants.get(0), PDFDict) : undefined;
    const dw = cid?.lookupMaybe(PDFName.of("DW"), PDFNumber)?.asNumber() ?? 1000;
    const widths = new Map<number, number>();
    const w = cid?.lookupMaybe(PDFName.of("W"), PDFArray)?.asArray() ?? [];
    for (let i = 0; i < w.length; ) {
      const first = (doc.context.lookup(w[i]) as PDFNumber).asNumber?.();
      const next = doc.context.lookup(w[i + 1]);
      if (first === undefined) break;
      if (next instanceof PDFArray) {
        next.asArray().forEach((v, k) => widths.set(first + k, (doc.context.lookup(v) as PDFNumber).asNumber()));
        i += 2;
      } else {
        const last = (next as PDFNumber).asNumber();
        const value = (doc.context.lookup(w[i + 2]) as PDFNumber).asNumber();
        for (let c = first; c <= last; c++) widths.set(c, value);
        i += 3;
      }
    }
    return { bytesPerCode: 2, width: (code) => widths.get(code) ?? dw };
  }
  const first = fontDict.lookupMaybe(PDFName.of("FirstChar"), PDFNumber)?.asNumber() ?? 0;
  const widths = fontDict.lookupMaybe(PDFName.of("Widths"), PDFArray)?.asArray().map((v) => (doc.context.lookup(v) as PDFNumber).asNumber());
  if (!widths) return { bytesPerCode: 1, width: () => 500 };
  return { bytesPerCode: 1, width: (code) => widths[code - first] ?? 500 };
}

function pageContentBytes(doc: PDFDocument, page: PDFPage): { bytes: Uint8Array; refs: PDFRef[] } | null {
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : contents instanceof PDFRef ? [contents] : [];
  const parts: Uint8Array[] = [];
  for (const ref of refs) {
    const stream = doc.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) return null;
    try {
      parts.push(decodePDFRawStream(stream).decode(), new Uint8Array([0x0a]));
    } catch {
      return null;
    }
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return { bytes: out, refs };
}

const STANDARD: Record<TextEdit["font"]["family"], [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

/** Keeps only characters the standard (WinAnsi) font can encode. */
function encodable(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/**
 * Replaces runs of existing text. Matching text-showing operators are removed
 * from the page content (so the old text is gone, not hidden), then the new
 * text is drawn in the closest standard font. If a run can't be found in the
 * page content (for example, text inside a form XObject), it is covered with a
 * white box and reported.
 */
async function applyTextEdits(doc: PDFDocument, edits: TextEdit[], report?: BuildReport): Promise<void> {
  const pages = doc.getPages();
  const fonts = new Map<StandardFonts, PDFFont>();
  const byPage = new Map<number, TextEdit[]>();
  for (const e of edits) byPage.set(e.page, [...(byPage.get(e.page) ?? []), e]);

  for (const [index, pageEdits] of byPage) {
    const page = pages[index];
    if (!page) continue;
    const content = pageContentBytes(doc, page);
    const fontDicts = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    const metrics = new Map<string, FontMetrics | null>();
    const fontFor = (name: string) => {
      if (!metrics.has(name)) metrics.set(name, fontMetrics(doc, fontDicts?.lookupMaybe(PDFName.of(name), PDFDict)));
      return metrics.get(name)!;
    };
    const ops = content ? findShowOps(content.bytes, fontFor) : [];
    const remove: ShowOp[] = [];
    const drawn: { edit: TextEdit; color: [number, number, number] | null; found: boolean }[] = [];
    for (const edit of pageEdits) {
      const matched = opsForTarget(ops, edit);
      remove.push(...matched);
      drawn.push({ edit, color: matched[0]?.color ?? null, found: matched.length > 0 });
    }
    if (content && remove.length) {
      const ref = doc.context.register(doc.context.flateStream(removeShowOps(content.bytes, remove)));
      page.node.set(PDFName.of("Contents"), ref);
      for (const old of content.refs) doc.context.delete(old);
    }
    for (const { edit, color, found } of drawn) {
      if (!found) {
        const [x1, y1, x2, y2] = textRunRect(edit.transform, edit.width, edit.size);
        page.drawRectangle({ x: x1 - 1, y: y1 - 1, width: x2 - x1 + 2, height: y2 - y1 + 2, color: rgb(1, 1, 1) });
        if (report && !report.coveredPages.includes(index + 1)) report.coveredPages.push(index + 1);
      }
      if (!edit.text) continue;
      const variant = STANDARD[edit.font.family][(edit.font.bold ? 1 : 0) + (edit.font.italic ? 2 : 0)]!;
      let font = fonts.get(variant);
      if (!font) {
        font = await doc.embedFont(variant);
        fonts.set(variant, font);
      }
      const [a, b, , , x, y] = edit.transform;
      const [r, g, bl] = edit.color ? hexToRgb(edit.color) : (color ?? [0, 0, 0]);
      page.drawText(encodable(font, edit.text), { x, y, size: edit.size, font, color: rgb(r, g, bl), rotate: degrees((Math.atan2(b, a) * 180) / Math.PI) });
    }
  }
}
