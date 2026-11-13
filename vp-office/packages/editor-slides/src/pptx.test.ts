import { TEMPLATES } from "@octo/core";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportPptx, importPptx, plainText, textBody, type Deck, type SlideElement } from "./index";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function sampleDeck(): Deck {
  return {
    version: 1,
    width: 13.333,
    height: 7.5,
    theme: "navy",
    slides: [
      {
        id: "s1",
        layout: "title",
        notes: "Welcome the client.",
        elements: [
          { id: "t1", kind: "text", role: "title", x: 0.6, y: 2.2, w: 12, h: 1.4, body: textBody("Smith v. Jones", { size: 40, bold: true, align: "center" }) },
          { id: "t2", kind: "text", role: "subtitle", x: 1.2, y: 3.7, w: 10.9, h: 0.8, body: textBody("Case briefing", { size: 22, align: "center" }) },
        ],
      },
      {
        id: "s2",
        layout: "titleContent",
        notes: "",
        background: "#f1f5f9",
        elements: [
          { id: "t3", kind: "text", role: "title", x: 0.6, y: 0.4, w: 12, h: 1, body: textBody("Key issues", { size: 32 }) },
          {
            id: "t4",
            kind: "text",
            role: "body",
            x: 0.6,
            y: 1.6,
            w: 6,
            h: 4,
            body: { paragraphs: [{ runs: [{ text: "Liability", bold: true, color: "#c00000", size: 20 }], bullet: true }, { runs: [{ text: "Damages", italic: true, size: 20 }], bullet: true }] },
          },
          { id: "sh1", kind: "shape", shape: "roundRect", x: 7.5, y: 1.8, w: 4, h: 1.5, fill: "#bbdefb", stroke: "#1e3a5f", strokeWidth: 2, rotation: 15, body: textBody("Risk: high", { size: 16 }) },
          { id: "im1", kind: "image", x: 7.5, y: 4, w: 2, h: 1.5, src: PNG, alt: "Seal" },
          { id: "tb1", kind: "table", x: 0.6, y: 5.8, w: 8, h: 1.2, header: true, rows: [["Party", "Role"], ["Acme", "Claimant"]] },
        ],
      },
      { id: "s3", layout: "blank", notes: "", hidden: true, elements: [{ id: "ln1", kind: "shape", shape: "line", x: 1, y: 3, w: 5, h: 0.02, fill: null, stroke: "#d32f2f", strokeWidth: 3 }] },
    ],
  };
}

async function stripEmbed(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  zip.remove("octo/deck.json");
  return zip.generateAsync({ type: "uint8array" });
}

const find = (els: SlideElement[], kind: SlideElement["kind"]) => els.filter((e) => e.kind === kind);
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.02);

describe("PPTX export and import", () => {
  it("round-trips slides through PowerPoint XML", async () => {
    const { bytes, warnings } = await exportPptx(sampleDeck());
    expect(warnings).toEqual([]);
    const { deck, fromEmbedded } = await importPptx(await stripEmbed(bytes));
    expect(fromEmbedded).toBe(false);
    expect(deck.slides).toHaveLength(3);
    close(deck.width, 13.333);
    close(deck.height, 7.5);

    const [s1, s2, s3] = deck.slides;
    expect(s1!.notes).toBe("Welcome the client.");
    const titles = find(s1!.elements, "text").map((e) => plainText((e as Extract<SlideElement, { kind: "text" }>).body));
    expect(titles).toEqual(["Smith v. Jones", "Case briefing"]);
    expect(s1!.background).toBe("#1e3a5f");

    expect(s2!.background).toBe("#f1f5f9");
    const body = find(s2!.elements, "text").find((e) => plainText((e as Extract<SlideElement, { kind: "text" }>).body).includes("Liability")) as Extract<SlideElement, { kind: "text" }>;
    expect(body.body.paragraphs.map((p) => !!p.bullet)).toEqual([true, true]);
    expect(body.body.paragraphs[0]!.runs[0]).toMatchObject({ text: "Liability", bold: true, color: "#c00000", size: 20 });
    expect(body.body.paragraphs[1]!.runs[0]).toMatchObject({ text: "Damages", italic: true });
    close(body.x, 0.6);
    close(body.y, 1.6);
    close(body.w, 6);

    const shape = find(s2!.elements, "shape")[0] as Extract<SlideElement, { kind: "shape" }>;
    expect(shape).toMatchObject({ shape: "roundRect", fill: "#bbdefb", stroke: "#1e3a5f" });
    close(shape.rotation ?? 0, 15);
    expect(plainText(shape.body)).toBe("Risk: high");

    const image = find(s2!.elements, "image")[0] as Extract<SlideElement, { kind: "image" }>;
    expect(image.src).toMatch(/^data:image\/png;base64,/);
    close(image.w, 2);

    const table = find(s2!.elements, "table")[0] as Extract<SlideElement, { kind: "table" }>;
    expect(table.rows).toEqual([
      ["Party", "Role"],
      ["Acme", "Claimant"],
    ]);

    expect(s3!.hidden).toBe(true);
    expect(find(s3!.elements, "shape")[0]).toMatchObject({ shape: "line", stroke: "#d32f2f" });
  });

  it("reopens presentations saved here losslessly", async () => {
    const { bytes } = await exportPptx(sampleDeck());
    const result = await importPptx(bytes);
    expect(result.fromEmbedded).toBe(true);
    expect(result.deck).toEqual(sampleDeck());
  });

  it("ignores the embedded deck when PowerPoint changed the slides", async () => {
    const { bytes } = await exportPptx(sampleDeck());
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("ppt/slides/slide2.xml")!.async("string");
    zip.file("ppt/slides/slide2.xml", xml.replace("Key issues", "Edited in PowerPoint"));
    const result = await importPptx(await zip.generateAsync({ type: "uint8array" }));
    expect(result.fromEmbedded).toBe(false);
    expect(JSON.stringify(result.deck)).toContain("Edited in PowerPoint");
  });

  it("reads the generated client briefing template", async () => {
    const file = await TEMPLATES.find((t) => t.id === "client-briefing")!.build();
    const { deck } = await importPptx(file.bytes);
    expect(deck.slides).toHaveLength(5);
    const texts = deck.slides.map((s) => s.elements.map((e) => (e.kind === "text" || e.kind === "shape" ? plainText(e.body) : "")).join(" | "));
    expect(texts[0]).toContain("[Matter name]");
    expect(texts[2]).toContain("[Issue 1]");
  });

  it("reports animations and charts", async () => {
    const { bytes } = await exportPptx(sampleDeck());
    const zip = await JSZip.loadAsync(await stripEmbed(bytes));
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    zip.file("ppt/slides/slide1.xml", xml.replace("</p:sld>", '<p:timing><p:tnLst/></p:timing></p:sld>').replace("</p:spTree>", '<p:graphicFrame><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame></p:spTree>'));
    const { warnings } = await importPptx(await zip.generateAsync({ type: "uint8array" }));
    expect(warnings).toEqual(expect.arrayContaining(["Transitions and animations were removed.", "Charts aren't supported yet and were removed."]));
  });
});
