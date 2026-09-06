import jsPDF from "jspdf";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";

/** Render CV markdown to a simple, readable PDF blob. */
export function cvToPdfBlob(markdown: string): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const pageH = doc.internal.pageSize.getHeight();
  let y = margin;

  const write = (text: string, size: number, bold: boolean) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const w of doc.splitTextToSize(text, width)) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin, y);
      y += size * 1.35;
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/\*\*/g, "").trimEnd();
    if (!line.trim()) {
      y += 6;
      continue;
    }
    if (line.startsWith("### ")) write(line.slice(4), 12, true);
    else if (line.startsWith("## ")) write(line.slice(3), 14, true);
    else if (line.startsWith("# ")) write(line.slice(2), 17, true);
    else if (line.startsWith("- ") || line.startsWith("* ")) write("•  " + line.slice(2), 10, false);
    else write(line, 10, false);
  }
  return doc.output("blob");
}

/** Render CV markdown to a .docx blob. */
export async function cvToDocxBlob(markdown: string): Promise<Blob> {
  const paras: Paragraph[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/\*\*/g, "").trimEnd();
    if (!line.trim()) {
      paras.push(new Paragraph(""));
    } else if (line.startsWith("### ")) {
      paras.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith("## ")) {
      paras.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith("# ")) {
      paras.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      paras.push(new Paragraph({ text: line.slice(2), bullet: { level: 0 } }));
    } else {
      paras.push(new Paragraph(line));
    }
  }
  const doc = new Document({ sections: [{ children: paras }] });
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
