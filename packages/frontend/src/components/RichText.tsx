/**
 * Renders scraped job text as readable paragraphs + left-aligned bullets.
 * Handles two cases: text that already has line breaks/bullets, and one long
 * run-on paragraph (which we split into sentences and group).
 */
export function RichText({ text, className = "" }: { text?: string; className?: string }) {
  if (!text?.trim()) return null;

  const rawLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks: { type: "bullet" | "para"; text: string }[] = [];
  for (const line of rawLines) {
    const bullet = line.match(/^\s*(?:[-*•·▪]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: "bullet", text: bullet[1].trim() });
    } else if (line.length > 320) {
      // One long paragraph — split into sentences, ~3 per paragraph.
      const sentences = line.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [line];
      for (let i = 0; i < sentences.length; i += 3) {
        blocks.push({ type: "para", text: sentences.slice(i, i + 3).join(" ").trim() });
      }
    } else {
      blocks.push({ type: "para", text: line });
    }
  }

  // Group consecutive bullets into a single list.
  const out: React.ReactNode[] = [];
  let bulletBuf: string[] = [];
  const flush = (key: string) => {
    if (bulletBuf.length) {
      out.push(
        <ul key={key} className="list-disc space-y-1 pl-5 text-left">
          {bulletBuf.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
      bulletBuf = [];
    }
  };
  blocks.forEach((b, i) => {
    if (b.type === "bullet") {
      bulletBuf.push(b.text);
    } else {
      flush(`ul-${i}`);
      out.push(
        <p key={`p-${i}`} className="text-left">
          {b.text}
        </p>,
      );
    }
  });
  flush("ul-end");

  return <div className={`space-y-2 text-left ${className}`}>{out}</div>;
}
