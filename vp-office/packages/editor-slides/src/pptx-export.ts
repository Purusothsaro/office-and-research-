import JSZip from "jszip";
import { defaultTextColor, slideBackground, THEMES, type Deck, type ShapeElement, type Slide, type TextBody, type TextElement } from "./model";

export const EMBED_PATH = "octo/deck.json";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash of the slide XML parts, to detect edits made by other programs. */
export async function slidesHash(zip: JSZip): Promise<string> {
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/(presentation\.xml|slides\/slide\d+\.xml|notesSlides\/notesSlide\d+\.xml)$/.test(n))
    .sort();
  let all = "";
  for (const n of names) all += `${n}\n${await zip.file(n)!.async("string")}\n`;
  return sha256Hex(all);
}

const hex = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c.slice(1).toUpperCase() : undefined);

type PptxGen = InstanceType<typeof import("pptxgenjs").default>;

function textRuns(body: TextBody, baseColor: string, font: string) {
  const runs: { text: string; options: Record<string, unknown> }[] = [];
  body.paragraphs.forEach((p, pi) => {
    const last = pi === body.paragraphs.length - 1;
    const pieces = p.runs.length ? p.runs : [{ text: "" }];
    pieces.forEach((r, ri) => {
      runs.push({
        text: r.text,
        options: {
          ...(r.bold ? { bold: true } : {}),
          ...(r.italic ? { italic: true } : {}),
          ...(r.underline ? { underline: { style: "sng" } } : {}),
          color: hex(r.color) ?? hex(baseColor),
          ...(r.size ? { fontSize: r.size } : {}),
          fontFace: r.font ?? font,
          ...(ri === 0 && p.align ? { align: p.align } : {}),
          ...(ri === 0 && p.bullet ? { bullet: true, indentLevel: p.level ?? 0 } : {}),
          ...(ri === pieces.length - 1 && !last ? { breakLine: true } : {}),
        },
      });
    });
  });
  return runs;
}

const SHAPES: Record<ShapeElement["shape"], string> = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  triangle: "triangle",
  line: "line",
  arrow: "line",
};

function addElements(pptx: PptxGen, slide: ReturnType<PptxGen["addSlide"]>, deck: Deck, s: Slide, warnings: Set<string>) {
  const theme = THEMES[deck.theme];
  for (const el of s.elements) {
    const box = { x: el.x, y: el.y, w: el.w, h: el.h, ...(el.rotation ? { rotate: el.rotation } : {}) };
    switch (el.kind) {
      case "text": {
        const color = defaultTextColor(deck, s, el as TextElement);
        slide.addText(textRuns(el.body, color, theme.font) as never, { ...box, valign: el.body.valign ?? "top", margin: 4, fontFace: theme.font, fontSize: 18 } as never);
        break;
      }
      case "shape": {
        const line = el.stroke ? { color: hex(el.stroke), width: el.strokeWidth, ...(el.shape === "arrow" ? { endArrowType: "triangle" } : {}) } : { type: "none" };
        const fill = el.fill && el.shape !== "line" && el.shape !== "arrow" ? { color: hex(el.fill) } : { type: "none" };
        const options = { ...box, shape: SHAPES[el.shape], fill, line, ...(el.shape === "roundRect" ? { rectRadius: 0.15 } : {}) };
        if (el.body && el.body.paragraphs.some((p) => p.runs.some((r) => r.text))) {
          slide.addText(textRuns(el.body, defaultTextColor(deck, s, el), theme.font) as never, { ...options, valign: el.body.valign ?? "middle", align: "center", fontFace: theme.font, fontSize: 16 } as never);
        } else {
          slide.addShape(SHAPES[el.shape] as never, options as never);
        }
        break;
      }
      case "image": {
        const match = /^data:(image\/(?:png|jpeg|gif));base64,(.*)$/i.exec(el.src);
        if (!match) {
          warnings.add("Some images use a format PowerPoint can't embed and were left out.");
          break;
        }
        slide.addImage({ data: `${match[1]};base64,${match[2]}`, ...box, ...(el.alt ? { altText: el.alt } : {}) } as never);
        break;
      }
      case "table": {
        const rows = el.rows.map((row, ri) => row.map((text) => ({ text, options: el.header && ri === 0 ? { bold: true, fill: { color: hex(theme.accent) }, color: "FFFFFF" } : {} })));
        slide.addTable(rows as never, { x: el.x, y: el.y, w: el.w, h: el.h, fontSize: 14, fontFace: theme.font, color: hex(theme.text), border: { type: "solid", pt: 1, color: "9CA3AF" } } as never);
        break;
      }
    }
  }
}

/** Writes a deck to PPTX bytes, embedding the deck for lossless reopening here. */
export async function exportPptx(deck: Deck): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const mod = await import("pptxgenjs");
  const PptxGenJS = (mod as unknown as { default: new () => PptxGen }).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "OCTO", width: deck.width, height: deck.height });
  pptx.layout = "OCTO";
  pptx.author = "OctoGenie Office";
  const warnings = new Set<string>();
  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(slideBackground(deck, s)) ?? "FFFFFF" };
    if (s.hidden) (slide as unknown as { hidden: boolean }).hidden = true;
    addElements(pptx, slide, deck, s, warnings);
    if (s.notes) slide.addNotes(s.notes);
  }
  const raw = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
  const zip = await JSZip.loadAsync(raw);
  zip.file(EMBED_PATH, JSON.stringify({ hash: await slidesHash(zip), deck }));
  const types = await zip.file("[Content_Types].xml")!.async("string");
  if (!types.includes('Extension="json"')) zip.file("[Content_Types].xml", types.replace(/(<Types[^>]*>)/, '$1<Default Extension="json" ContentType="application/json"/>'));
  return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), warnings: [...warnings] };
}
