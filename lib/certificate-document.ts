import PDFDocument from "pdfkit";
import { join } from "node:path";

const fonts = {
  latin: "NotoSans-Regular.ttf",
  arabic: "NotoSansArabic-Regular.ttf",
  devanagari: "NotoSansDevanagari-Regular.ttf",
  malayalam: "NotoSansMalayalam-Regular.ttf",
};
type Font = keyof typeof fonts;
type Run = { text: string; font: Font };

/** Keep combining sequences together and let fontkit shape each script run. */
function runs(text: string): Run[] {
  const result: Run[] = [];
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  for (const [index, { segment }] of segments.entries()) {
    const previous = result.at(-1);
    const font: Font = /\p{Script=Arabic}/u.test(segment) ? "arabic" : /\p{Script=Devanagari}/u.test(segment) ? "devanagari" : /\p{Script=Malayalam}/u.test(segment) ? "malayalam" : /[\p{Letter}\p{Number}]/u.test(segment) ? "latin" : /\s/u.test(segment) && !(previous?.font === "arabic" && /\p{Script=Arabic}/u.test(segments[index + 1]?.segment ?? "")) ? "latin" : previous?.font ?? "latin";
    if (previous?.font === font) previous.text += segment;
    else result.push({ text: segment, font });
  }
  // Arabic paragraphs start at the right, while embedded Latin identifiers remain LTR.
  return /^\p{Script=Arabic}/u.test(text.trim()) ? result.reverse() : result;
}

export async function certificateDocument(data: { learnerName: string; courseTitle: string; dateLine: string; serial: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40, font: join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"), info: { Title: "welearn Certificate of Completion" } });
  for (const [name, file] of Object.entries(fonts)) doc.registerFont(name, join(process.cwd(), "public/fonts", file));
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const features: PDFKit.Mixins.OpenTypeFeatures[] = ["kern", "liga"];
  const measure = (text: string, size: number) => runs(text).reduce((sum, run) => sum + doc.font(run.font).fontSize(size).widthOfString(run.text, { features }), 0);
  const width = 710;
  const wrap = (text: string, size: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, size) <= width) { line = next; continue; }
      if (line) lines.push(line);
      line = "";
      // Unbroken names/identifiers also wrap without cutting a combining sequence.
      for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word)) {
        if (line && measure(line + segment, size) > width) { lines.push(line); line = ""; }
        line += segment;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const block = (text: string, y: number, maxHeight: number, preferredSize: number, color = "#172B4D") => {
    let size = preferredSize, lines = wrap(text, size);
    while (lines.length * size * 1.6 > maxHeight && size > 8) { size -= 0.5; lines = wrap(text, size); }
    for (const [index, line] of lines.entries()) {
      let x = (doc.page.width - measure(line, size)) / 2;
      for (const run of runs(line)) {
        doc.font(run.font).fontSize(size).fillColor(color).text(run.text, x, y + index * size * 1.6, { lineBreak: false, features, baseline: "alphabetic" });
        x += doc.widthOfString(run.text, { features });
      }
    }
  };
  doc.lineWidth(2).strokeColor("#1559C9").rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();
  block("welearn", 90, 36, 18, "#1559C9");
  block("Certificate of Completion", 156, 50, 32);
  block("This certifies that", 195, 24, 13);
  block(data.learnerName, 233, 70, 25);
  block("has completed", 307, 24, 13);
  block(data.courseTitle, 344, 90, 21);
  block(data.dateLine, 445, 24, 12);
  block(`Verification ID: ${data.serial}`, 474, 24, 10, "#526477");
  block("Internal training record - not an accredited or government certification.", 533, 20, 9, "#526477");
  doc.end();
  return result;
}
