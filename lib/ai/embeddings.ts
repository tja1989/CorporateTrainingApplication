import { createHash } from "crypto";

/**
 * Embeddings provider (spec §9.2): Voyage `voyage-3.5` (1024-d, multilingual)
 * behind an interface; deterministic hashed-bag-of-words fallback when no key —
 * cosine similarity then reflects term overlap, so hybrid retrieval still works
 * honestly in demo mode (BGE-M3 self-hosted is the documented residency swap).
 */

export const EMBEDDING_DIM = 1024;

export function embeddingsAvailable(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

export async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!embeddingsAvailable()) return texts.map(mockEmbed);
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: "voyage-3.5", input: texts, input_type: inputType, output_dimension: EMBEDDING_DIM }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

/** Deterministic lexical pseudo-embedding: hashed bag of word bigrams, L2-normalized. */
export function mockEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const terms = [...words];
  for (let i = 0; i < words.length - 1; i++) terms.push(words[i] + "_" + words[i + 1]);
  for (const term of terms) {
    const h = createHash("sha1").update(term).digest();
    const idx = h.readUInt32BE(0) % EMBEDDING_DIM;
    const sign = h[4] % 2 === 0 ? 1 : -1;
    v[idx] += sign;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
