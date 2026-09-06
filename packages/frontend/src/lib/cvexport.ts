import jsPDF from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  BorderStyle,
} from "docx";

const BRAND: [number, number, number] = [37, 99, 235];

type Block =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "body"; text: string }
  | { kind: "space" };

const strip = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();
const looksContact = (s: string) => /@|\+?\d[\d\s()-]{6,}|https?:\/\/|github\.com|linkedin/i.test(s);

/** Parse CV markdown into a small set of styled blocks for a clean layout. */
function parse(markdown: string): Block[] {
  const raw = markdown.split("\n");
  const blocks: Block[] = [];
  let nameSet = false;

  for (let i = 0; i < raw.length; i++) {
    const line = strip(raw[i].replace(/^\s*[-*]\s+/, (m) => m)); // keep bullet marker for detection
    const t = line.trim();
    if (!t) {
      blocks.push({ kind: "space" });
      continue;
    }
    // First substantive line = the candidate's name.
    if (!nameSet && !t.startsWith("#") && !t.startsWith("-") && !t.startsWith("*")) {
      const name = t.replace(/^#+\s*/, "");
      blocks.push({ kind: "name", text: name });
      nameSet = true;
      // The following contact-looking line becomes the contact row.
      const next = strip(raw[i + 1] ?? "");
      if (next && looksContact(next) && !next.startsWith("#")) {
        blocks.push({ kind: "contact", text: next.replace(/\s*\|\s*/g, "  ·  ") });
        i++;
      }
      continue;
    }
    if (t.startsWith("# ")) {
      if (!nameSet) {
        blocks.push({ kind: "name", text: t.slice(2) });
        nameSet = true;
      } else blocks.push({ kind: "h2", text: t.slice(2) });
    } else if (t.startsWith("## ")) blocks.push({ kind: "h2", text: t.slice(3) });
    else if (t.startsWith("### ")) blocks.push({ kind: "h3", text: t.slice(4) });
    else if (t.startsWith("#### ")) blocks.push({ kind: "h3", text: t.slice(5) });
    else if (/^[-*]\s+/.test(t)) blocks.push({ kind: "bullet", text: t.replace(/^[-*]\s+/, "") });
    else blocks.push({ kind: "body", text: t });
  }
  return blocks;
}

/** Render CV markdown to a clean, professionally-laid-out PDF. */
export function cvToPdfBlob(markdown: string): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 50;
  const cw = W - M * 2;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const para = (text: string, size: number, bold: boolean, indent = 0, gap = 1.35) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(40, 40, 40);
    for (const w of doc.splitTextToSize(text, cw - indent)) {
      ensure(size * gap);
      doc.text(w, M + indent, y);
      y += size * gap;
    }
  };

  for (const b of parse(markdown)) {
    switch (b.kind) {
      case "name":
        ensure(26);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(...BRAND);
        doc.text(b.text, M, y);
        y += 24;
        break;
      case "contact":
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(90, 90, 90);
        ensure(14);
        for (const w of doc.splitTextToSize(b.text, cw)) {
          doc.text(w, M, y);
          y += 12;
        }
        y += 6;
        break;
      case "h2":
        y += 8;
        ensure(22);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...BRAND);
        doc.text(b.text.toUpperCase(), M, y);
        y += 5;
        doc.setDrawColor(...BRAND);
        doc.setLineWidth(0.8);
        doc.line(M, y, W - M, y);
        y += 12;
        break;
      case "h3":
        y += 4;
        para(b.text, 10.5, true);
        break;
      case "bullet":
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        {
          const wrapped = doc.splitTextToSize(b.text, cw - 16);
          ensure(14);
          doc.text("•", M + 2, y);
          wrapped.forEach((w: string, idx: number) => {
            if (idx > 0) ensure(13);
            doc.text(w, M + 16, y);
            y += 13;
          });
        }
        break;
      case "body":
        para(b.text, 10, false);
        break;
      case "space":
        y += 5;
        break;
    }
  }
  return doc.output("blob");
}

/** Render CV markdown to a clean .docx. */
export async function cvToDocxBlob(markdown: string): Promise<Blob> {
  const brandHex = "2563EB";
  const children: Paragraph[] = [];
  for (const b of parse(markdown)) {
    switch (b.kind) {
      case "name":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: b.text, bold: true, size: 40, color: brandHex })],
            spacing: { after: 40 },
          }),
        );
        break;
      case "contact":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: b.text, size: 18, color: "5A5A5A" })],
            spacing: { after: 160 },
          }),
        );
        break;
      case "h2":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 24, color: brandHex })],
            spacing: { before: 220, after: 80 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: brandHex } },
          }),
        );
        break;
      case "h3":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: b.text, bold: true, size: 21 })],
            spacing: { before: 80, after: 20 },
          }),
        );
        break;
      case "bullet":
        children.push(new Paragraph({ text: b.text, bullet: { level: 0 }, spacing: { after: 20 } }));
        break;
      case "body":
        children.push(new Paragraph({ children: [new TextRun({ text: b.text, size: 20 })], spacing: { after: 40 } }));
        break;
      case "space":
        break;
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: {}, children: children.length ? children : [new Paragraph("")] }],
  });
  return Packer.toBlob(doc);
}

/** Base64 (no data-URL prefix) for a blob — for the Gmail attachment. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}
