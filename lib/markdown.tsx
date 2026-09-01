import type { ReactNode } from "react";

/** Tiny markdown renderer (headings, bold, italics, lists, paragraphs, code). */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="prose-ll">
      {blocks.map((block, i) => (
        <Block key={i} block={block.trim()} />
      ))}
    </div>
  );
}

function Block({ block }: { block: string }) {
  if (!block) return null;
  const h = block.match(/^(#{1,3})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    const content = inline(h[2]);
    if (level === 1) return <h1>{content}</h1>;
    if (level === 2) return <h2>{content}</h2>;
    return <h3>{content}</h3>;
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
