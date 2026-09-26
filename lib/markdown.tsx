import { createElement, type ReactNode } from "react";

/** Tiny markdown renderer (headings, bold, italics, lists, paragraphs, code). */
export function markdownBlocks(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/^(#{1,6}\s+[^\n]+)$/gm, "\n\n$1\n\n")
    .split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
}

export function Markdown({ text, headingOffset = 0, highlightAnchor }: { text: string; headingOffset?: number; highlightAnchor?: string | null }) {
  const blocks = markdownBlocks(text);
  return (
    <div className="prose-ll">
      {blocks.map((block, i) => (
        <Block key={i} block={block.trim()} headingOffset={headingOffset} highlightAnchor={highlightAnchor} />
      ))}
    </div>
  );
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function Block({ block, headingOffset, highlightAnchor }: { block: string; headingOffset: number; highlightAnchor?: string | null }) {
  if (!block) return null;
  const h = block.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    const level = Math.min(6, h[1].length + headingOffset);
    const content = inline(h[2]);
    const anchor = slugify(h[2]);
    const highlighted = anchor === highlightAnchor;
    return createElement(`h${level}`, {
      id: anchor,
      className: `scroll-mt-24${level >= 4 ? " mb-2 mt-6 font-semibold" : ""}${highlighted ? " rounded-control bg-accent-tint px-3 py-2" : ""}`,
      tabIndex: highlighted ? -1 : undefined,
      "data-cited-section": highlighted ? true : undefined,
    }, content);
  }
  const lines = block.split("\n");
  if (lines.every((l) => /^[-*]\s+/.test(l))) {
    return (
      <ul>
        {lines.map((l, i) => (
          <li key={i}>{inline(l.replace(/^[-*]\s+/, ""))}</li>
        ))}
      </ul>
    );
  }
  if (lines.every((l) => /^\d+[.)]\s+/.test(l))) {
    return (
      <ol>
        {lines.map((l, i) => (
          <li key={i}>{inline(l.replace(/^\d+[.)]\s+/, ""))}</li>
        ))}
      </ol>
    );
  }
  return <p>{lines.map((l, i) => (
    <span key={i}>
      {i > 0 ? <br /> : null}
      {inline(l)}
    </span>
  ))}</p>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = s;
  let key = 0;
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/;
  while (rest) {
    const m = rest.match(pattern);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    if (token.startsWith("**")) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    rest = rest.slice(m.index + token.length);
  }
  return out;
}
