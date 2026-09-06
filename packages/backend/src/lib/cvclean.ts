/**
 * Clean the markdown produced by AI.toMarkdown() from DOCX/PDF CVs. Those
 * conversions leave behind empty image tags, layout tables, and stray separators
 * that read as junk. We keep real content (headings, bold, bullets, real links).
 */
export function cleanCvMarkdown(md: string): string {
  return (
    md
      // Empty/placeholder images: ![](...) or ![alt]()
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // Empty-text links: [ ](url) — keep links that have visible text
      .replace(/\[\s*\]\([^)]*\)/g, "")
      // Markdown table rows and separator rows (layout tables from DOCX)
      .replace(/^\s*\|.*\|\s*$/gm, "")
      .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, "")
      // HTML comments / stray anchor tags
      .replace(/<!--[\s\S]*?-->/g, "")
      // Collapse excess blank lines and trailing spaces
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
