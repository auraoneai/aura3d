// Docs knowledge: loads the build-time bundle, chunks it, and answers BM25 queries and table lookups.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, search, type Bm25Index, type Chunk, type Hit } from "./bm25.js";
import { buildDocsBundle, type DocsBundle } from "./bundle/build.js";

export interface ErrorRow {
  readonly code: string;
  readonly kind: string;
  readonly cause: string;
  readonly fix: string;
}

export interface DocsKnowledge {
  readonly bundle: DocsBundle;
  readonly index: Bm25Index;
  readonly errors: readonly ErrorRow[];
  file(path: string): string | undefined;
  query(query: string, kinds: readonly Chunk["kind"][], limit: number): Hit[];
}

const here = dirname(fileURLToPath(import.meta.url));

/** data/docs-bundle.json next to the package; when running from monorepo source, build it from the repo instead. */
export function loadBundle(explicit?: string): DocsBundle {
  const candidates = [explicit, process.env.AURA3D_MCP_DOCS_BUNDLE, resolve(here, "..", "data", "docs-bundle.json")].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, "utf8")) as DocsBundle;
  }
  const repoRoot = resolve(here, "..", "..", "..");
  if (existsSync(join(repoRoot, "docs", "agents", "recipes.md"))) return buildDocsBundle(repoRoot);
  throw new Error("aura3d-mcp: docs bundle not found. Run `pnpm --filter @aura3d/mcp bundle-docs` after building, or set AURA3D_MCP_DOCS_BUNDLE.");
}

/** Largest chunk, in characters. search_docs returns whole chunks, so a fact is never clipped away. */
export const MAX_CHUNK_CHARS = 1200;
const OVERLAP_CHARS = 300;

/** Split text into pieces of at most `max` characters, on blank lines first, then line by line, then by characters. */
function splitPieces(body: string, max: number): string[] {
  const pieces: string[] = [];
  let inFence = false;
  let cur: string[] = [];
  const paragraphs: string[] = [];
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) inFence = !inFence;
    cur.push(line);
    if (!inFence && line.trim() === "") {
      paragraphs.push(cur.join("\n"));
      cur = [];
    }
  }
  if (cur.length) paragraphs.push(cur.join("\n"));
  for (const para of paragraphs) {
    if (para.length <= max) {
      pieces.push(para);
      continue;
    }
    let acc = "";
    for (const line of para.split("\n")) {
      for (let i = 0; i < Math.max(1, line.length); i += max - 1) {
        const part = line.slice(i, i + max - 1);
        if (acc && acc.length + part.length + 1 > max) {
          pieces.push(acc);
          acc = "";
        }
        acc = acc ? `${acc}\n${part}` : part;
      }
    }
    if (acc) pieces.push(acc);
  }
  return pieces;
}

/** Group pieces into windows of at most `max` characters; each window repeats the previous tail as overlap. */
function windows(pieces: readonly string[], max: number): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const piece of pieces) {
    if (cur.length && len + piece.length > max) {
      out.push(cur.join("\n"));
      const tail = cur.at(-1)!;
      cur = tail.length <= OVERLAP_CHARS && tail.length + piece.length <= max ? [tail] : [];
      len = cur.reduce((n, c) => n + c.length + 1, 0);
    }
    cur.push(piece);
    len += piece.length + 1;
  }
  if (cur.length) out.push(cur.join("\n"));
  return out;
}

/** Chunk by heading, then split any section over MAX_CHUNK_CHARS into overlapping paragraph windows. */
export function chunkMarkdown(text: string, path: string, kind: Chunk["kind"]): Chunk[] {
  const chunks: Chunk[] = [];
  let heading = path;
  let buf: string[] = [];
  let inFence = false;
  const flush = (): void => {
    const body = buf.join("\n").trim();
    buf = [];
    if (body.length <= 40) return;
    if (body.length <= MAX_CHUNK_CHARS) {
      chunks.push({ path, title: heading, kind, text: body });
      return;
    }
    for (const win of windows(splitPieces(body, MAX_CHUNK_CHARS), MAX_CHUNK_CHARS)) {
      const t = win.trim();
      if (t.length > 40) chunks.push({ path, title: heading, kind, text: t });
    }
  };
  for (const line of text.split("\n")) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,4} /.test(line)) {
      flush();
      heading = line.replace(/^#+\s*/, "").slice(0, 100);
    }
    buf.push(line);
  }
  flush();
  return chunks;
}

function tableRows(text: string, path: string, titleOf: (row: string) => string): Chunk[] {
  return text
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[\s:|-]+\|?$/.test(l) && !/^\| *(Call|Error|Code|Defaults|Columns|If you would|three\.js)\b/i.test(l))
    .map((row) => ({ path, title: titleOf(row), kind: "gotcha" as const, text: row.trim() }));
}

export function parseErrorTable(text: string): ErrorRow[] {
  const rows: ErrorRow[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("|") || /^\|[\s:|-]+\|?$/.test(line)) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    if (cells.length < 4 || cells[0] === "Code") continue;
    rows.push({ code: cells[0]!, kind: cells[1]!, cause: cells[2]!, fix: cells.slice(3).join(" | ") });
  }
  return rows;
}

export function createKnowledge(bundle: DocsBundle): DocsKnowledge {
  const chunks: Chunk[] = [];
  const byPath = new Map<string, string>();
  let errors: ErrorRow[] = [];
  for (const file of bundle.files) {
    byPath.set(file.path, file.text);
    if (file.kind === "recipe-source") {
      chunks.push({ path: file.path, title: file.path.split("/").at(-2) ?? file.path, kind: "recipe", text: file.text });
    } else if (file.kind === "llms") {
      chunks.push(...chunkMarkdown(file.text, file.path, "doc"));
      const pitfalls = file.text.split(/^## /m).find((s) => /^Pitfalls/i.test(s));
      for (const line of (pitfalls ?? "").split("\n").filter((l) => l.startsWith("- "))) chunks.push({ path: file.path, title: "pitfall", kind: "gotcha", text: line });
    } else if (/api-signatures\.md$/.test(file.path)) {
      chunks.push(...chunkMarkdown(file.text, file.path, "sig"));
    } else if (/(recipes|first-screen-cheatsheet)\.md$/.test(file.path)) {
      chunks.push(...chunkMarkdown(file.text, file.path, "recipe-doc"));
      if (/recipes\.md$/.test(file.path)) chunks.push(...tableRows(file.text.split("## Type traps")[1] ?? "", file.path, () => "type trap"));
    } else if (/error-codes\.md$/.test(file.path)) {
      errors = parseErrorTable(file.text);
      chunks.push(...chunkMarkdown(file.text, file.path, "doc"));
    } else {
      chunks.push(...chunkMarkdown(file.text, file.path, "doc"));
      if (/threejs-to-aura3d\.md$/.test(file.path)) chunks.push(...tableRows(file.text, file.path, (row) => row.split("|")[1]?.trim().slice(0, 60) ?? "mapping"));
    }
  }
  const seen = new Set<string>();
  const unique = chunks.filter((c) => {
    const key = `${c.kind}:${c.text.length}:${c.text.slice(0, 200)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const index = buildIndex(unique);
  return {
    bundle,
    index,
    errors,
    file: (path) => byPath.get(path),
    query: (query, kinds, limit) => search(index, query, kinds, limit)
  };
}
