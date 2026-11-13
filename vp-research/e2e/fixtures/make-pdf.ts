import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

/** A two-page sample PDF with selectable text and a form field. */
export async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let n = 1; n <= 2; n++) {
    const page = doc.addPage([612, 792]);
    page.drawText(n === 1 ? "SETTLEMENT AGREEMENT" : "SCHEDULE 1", { x: 72, y: 700, size: 20, font: bold });
    const lines = [
      "This Agreement is made between Acme Holdings Ltd and Beta Corp.",
      "The parties agree to keep the terms of this settlement Confidential.",
      "Payment of the settlement sum is due within thirty days of signing.",
      `This is page ${n} of the sample document used in automated tests.`,
    ];
    lines.forEach((t, i) => page.drawText(t, { x: 72, y: 650 - i * 22, size: 12, font, color: rgb(0.1, 0.1, 0.1) }));
  }
  const form = doc.getForm();
  form.createTextField("signatory").addToPage(doc.getPage(0), { x: 72, y: 450, width: 220, height: 22 });
  return Buffer.from(await doc.save());
}
