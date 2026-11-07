// Plain BM25 over small text chunks. No network, no model. Identifiers are split on camelCase and snake_case so
// "autoRotate" matches "auto rotate" and "autorotate".
export interface Chunk {
  readonly path: string;
  readonly title: string;
  readonly kind: "recipe" | "recipe-doc" | "sig" | "doc" | "gotcha";
  readonly text: string;
}

export interface IndexedChunk extends Chunk {
  readonly tf: Map<string, number>;
  readonly len: number;
}

export interface Bm25Index {
  readonly docs: readonly IndexedChunk[];
  readonly df: Map<string, number>;
  readonly avg: number;
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "you", "your", "not", "use", "can", "any", "all", "has", "have", "into", "its", "of", "to", "in", "is", "it", "or", "on", "an", "as", "be", "by", "at", "how", "do", "make", "create", "build"]);

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    out.push(word.toLowerCase());
    const parts = word.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").split(" ").map((p) => p.toLowerCase()).filter(Boolean);
    if (parts.length > 1) out.push(...parts);
  }
  return out.filter((t) => t.length > 1 && !STOP.has(t));
}

export function buildIndex(chunks: readonly Chunk[]): Bm25Index {
  const docs: IndexedChunk[] = chunks.map((chunk) => {
    const body = tokenize(chunk.text);
    const head = tokenize(`${chunk.title} ${chunk.path}`);
    const tf = new Map<string, number>();
    for (const token of [...body, ...head, ...head]) tf.set(token, (tf.get(token) ?? 0) + 1);
    return { ...chunk, tf, len: body.length + 2 * head.length };
  });
  const df = new Map<string, number>();
  for (const doc of docs) for (const token of doc.tf.keys()) df.set(token, (df.get(token) ?? 0) + 1);
  const avg = docs.reduce((sum, doc) => sum + doc.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg };
}

export interface Hit {
  readonly chunk: IndexedChunk;
  readonly score: number;
}

export function search(index: Bm25Index, query: string, kinds: readonly Chunk["kind"][], limit: number): Hit[] {
  const q = [...new Set(tokenize(query))];
  const k1 = 1.2;
  const b = 0.75;
  const n = index.docs.length;
  const hits: Hit[] = [];
  for (const chunk of index.docs) {
    if (!kinds.includes(chunk.kind)) continue;
    let score = 0;
    for (const token of q) {
      const f = chunk.tf.get(token);
      if (!f) continue;
      const df = index.df.get(token) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * chunk.len) / index.avg));
    }
    if (score > 0) hits.push({ chunk, score });
  }
  hits.sort((a, c) => c.score - a.score);
  return hits.slice(0, limit);
}
