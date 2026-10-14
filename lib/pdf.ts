/**
 * Minimal single-page PDF writer (no dependencies) — enough for certificate
 * one-pagers: centered Helvetica text lines on A4 landscape.
 */

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export type PdfLine = { text: string; size: number; y: number; bold?: boolean; color?: [number, number, number] };

export function makePdf(lines: PdfLine[]): Buffer {
  const W = 842; // A4 landscape pts
  const H = 595;
  let content = "";
  for (const line of lines) {
    const font = line.bold ? "/F2" : "/F1";
    const approxWidth = line.text.length * line.size * (line.bold ? 0.53 : 0.5);
    const x = Math.max(40, (W - approxWidth) / 2);
    const [r, g, b] = line.color ?? [0.09, 0.169, 0.302];
    content += `BT ${font} ${line.size} Tf ${r} ${g} ${b} rg 1 0 0 1 ${x.toFixed(1)} ${line.y} Tm (${esc(line.text)}) Tj ET\n`;
  }
  // border
  content += `0.082 0.349 0.788 RG 2 w 30 30 ${W - 60} ${H - 60} re S\n`;

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
  );
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

export async function certificatePdf(opts: {
  learnerName: string;
  courseTitle: string;
  completedAt: Date;
  expiresAt: Date | null;
  serial: string;
}): Promise<Buffer> {
  const { certificateDocument } = await import("./certificate-document");
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return certificateDocument({ ...opts, dateLine: `Completed on ${fmt(opts.completedAt)}${opts.expiresAt ? ` · Valid until ${fmt(opts.expiresAt)}` : ""}` });
}
