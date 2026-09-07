"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Heading1, Heading2, Heading3, List, Pilcrow } from "lucide-react";

/**
 * A lightweight Word-like rich-text editor for CV content. It renders a white
 * "page" and edits HTML via contentEditable, but stores/emits Markdown so the
 * existing PDF/DOCX export pipeline (which consumes Markdown) is unchanged.
 */
export function RichCVEditor({
  initialMarkdown,
  onChange,
}: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Seed the editable area once from the incoming markdown.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = mdToHtml(initialMarkdown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    if (ref.current) onChange(htmlToMd(ref.current));
  }

  function cmd(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    emit();
  }

  const Btn = ({
    onClick,
    title,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep selection
      onClick={onClick}
      className="rounded-lg p-1.5 text-gray-600 hover:bg-brand-50 hover:text-brand-700"
    >
      {children}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-300 bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50/80 p-1.5">
        <Btn title="Heading 1" onClick={() => cmd("formatBlock", "<h1>")}>
          <Heading1 className="h-4 w-4" />
        </Btn>
        <Btn title="Heading 2" onClick={() => cmd("formatBlock", "<h2>")}>
          <Heading2 className="h-4 w-4" />
        </Btn>
        <Btn title="Heading 3" onClick={() => cmd("formatBlock", "<h3>")}>
          <Heading3 className="h-4 w-4" />
        </Btn>
        <Btn title="Paragraph" onClick={() => cmd("formatBlock", "<p>")}>
          <Pilcrow className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-5 w-px bg-gray-300" />
        <Btn title="Bold" onClick={() => cmd("bold")}>
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn title="Italic" onClick={() => cmd("italic")}>
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn title="Bulleted list" onClick={() => cmd("insertUnorderedList")}>
          <List className="h-4 w-4" />
        </Btn>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        className="cv-doc min-h-[45vh] flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-gray-800 focus:outline-none"
      />

      {/* Document-like typography for the editable area. */}
      <style jsx global>{`
        .cv-doc h1 {
          font-size: 1.5rem;
          font-weight: 800;
          margin: 0.6em 0 0.3em;
        }
        .cv-doc h2 {
          font-size: 1.2rem;
          font-weight: 700;
          margin: 0.6em 0 0.25em;
          border-bottom: 1px solid #eee;
          padding-bottom: 0.15em;
        }
        .cv-doc h3 {
          font-size: 1.05rem;
          font-weight: 600;
          margin: 0.5em 0 0.2em;
        }
        .cv-doc p {
          margin: 0.4em 0;
        }
        .cv-doc ul {
          list-style: disc;
          padding-left: 1.4em;
          margin: 0.4em 0;
        }
        .cv-doc li {
          margin: 0.15em 0;
        }
      `}</style>
    </div>
  );
}

/* ----------------------------- conversions ----------------------------- */

/** Escapes HTML special chars in plain text. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline markdown (**bold**, *italic*) → HTML. */
function inlineMdToHtml(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

/** Markdown → HTML for the editable area (headings, bullets, paragraphs). */
function mdToHtml(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const lvl = h[1].length;
      html.push(`<h${lvl}>${inlineMdToHtml(h[2])}</h${lvl}>`);
    } else if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMdToHtml(bullet[1])}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      closeList(); // horizontal rule → ignore visually
    } else {
      closeList();
      html.push(`<p>${inlineMdToHtml(line)}</p>`);
    }
  }
  closeList();
  return html.join("") || "<p></p>";
}

/** Inline DOM node → markdown. */
function inlineMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(inlineMd).join("");
  switch (el.tagName) {
    case "STRONG":
    case "B":
      return inner.trim() ? `**${inner}**` : inner;
    case "EM":
    case "I":
      return inner.trim() ? `*${inner}*` : inner;
    case "BR":
      return "\n";
    default:
      return inner;
  }
}

/** Editable-area HTML (via DOM) → markdown. */
function htmlToMd(root: HTMLElement): string {
  const out: string[] = [];
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").trim();
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "H1") out.push(`# ${inlineMd(el).trim()}`);
    else if (tag === "H2") out.push(`## ${inlineMd(el).trim()}`);
    else if (tag === "H3" || tag === "H4") out.push(`### ${inlineMd(el).trim()}`);
    else if (tag === "UL" || tag === "OL") {
      el.querySelectorAll(":scope > li").forEach((li) => {
        const text = inlineMd(li).trim();
        if (text) out.push(`- ${text}`);
      });
    } else if (tag === "DIV" || tag === "P") {
      const text = inlineMd(el).trim();
      out.push(text); // keep blank lines as paragraph separators
    } else if (tag === "BR") {
      out.push("");
    } else {
      const text = inlineMd(el).trim();
      if (text) out.push(text);
    }
  });
  // Collapse 3+ blank lines to a single blank line.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
