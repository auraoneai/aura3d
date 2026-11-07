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

function chunkMarkdown(text: string, path: string, kind: Chunk["kind"]): Chunk[] {
  const chunks: Chunk[] = [];
  let heading = path;
  let buf: string[] = [];
  let inFence = false;
  const flush = (): void => {
    const body = buf.join("\n").trim();
    if (body.length > 40) chunks.push({ path, title: heading, kind, text: body });
    buf = [];
  };
  for (const line of text.split("\n")) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,4} /.test(line)) {
      flush();
      heading = line.replace(/^#+\s*/, "").slice(0, 100);
    }
    buf.push(line);
    if (!inFence && buf.join("\n").length > 3800 && line.trim() === "") flush();
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
