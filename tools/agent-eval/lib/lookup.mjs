// aura_lookup(query): a one-call documentation lookup for the Aura3D arm (prototype of an MCP server).
// Plain BM25 over what the agent could already read in its sandbox (entry docs, docs/agents, skills, recipe sources,
// and the engine's agent-api .d.ts files). No LLM, no network. One query returns the best recipe source, the best exact
// signatures and the best gotchas together, so a search+read loop becomes a single call.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const TYPES_DIRS = ["node_modules/@aura3d/engine/dist/engine/agent-api", "node_modules/@aura3d/engine/dist/engine/contracts"];
const SKIP = /(^|\/)(samples|\.dist|skills-examples)(\/|$)|\.(png|jpe?g|webp|map|glb)$/i;
const LIMITS = { recipe: { n: 2, chars: 3200 }, sig: { n: 4, chars: 1500 }, gotcha: { n: 3, chars: 420 }, doc: { n: 1, chars: 1500 } };

function walk(root, out = []) {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function tokenize(text) {
  const out = [];
  for (const word of String(text).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    const lower = word.toLowerCase();
    out.push(lower);
    const parts = word.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").split(" ").map((p) => p.toLowerCase()).filter(Boolean);
    if (parts.length > 1) out.push(...parts);
  }
  return out.filter((t) => t.length > 1 && !STOP.has(t));
}
const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "you", "your", "not", "use", "can", "any", "all", "has", "have", "into", "its", "of", "to", "in", "is", "it", "or", "on", "an", "as", "be", "by", "at"]);

function chunkMarkdown(text, rel, kind) {
  const chunks = [];
  const lines = text.split("\n");
  let heading = rel;
  let buf = [];
  let inFence = false;
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body.length > 40) chunks.push({ path: rel, title: heading, kind, text: body });
    buf = [];
  };
  for (const line of lines) {
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

function tableRowChunks(text, rel, kind, titleOf) {
  return text
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|[\s:|-]+\|?$/.test(l) && !/^\| *(Call|If you would|Error|Defaults|Columns)\b/i.test(l))
    .map((row) => ({ path: rel, title: titleOf(row), kind, text: row.trim() }));
}

function bulletChunks(text, rel, kind) {
  const out = [];
  const section = text.split(/^## /m).find((s) => /^Pitfalls/i.test(s));
  if (!section) return out;
  for (const line of section.split("\n").filter((l) => l.startsWith("- "))) out.push({ path: rel, title: "pitfall", kind, text: line });
  return out;
}

function chunkTypes(text, rel) {
  const chunks = [];
  const pending = [];
  let current = null;
  const push = () => current && current.lines.join("\n").length > 30 && chunks.push({ path: rel, title: current.title, kind: "sig", text: current.lines.join("\n") });
  for (const line of text.split("\n")) {
    if (/^(export |declare |interface |type |const |function )/.test(line)) {
      push();
      const title = (line.match(/(?:interface|type|function|const|class)\s+([A-Za-z0-9_]+)/) ?? [])[1] ?? line.slice(0, 40);
      current = { title, lines: [...pending, line] };
      pending.length = 0;
    } else if (/^(\/\*\*| \*|\/\/)/.test(line) && (!current || /^\}|;\s*$/.test(current.lines.at(-1) ?? ""))) {
      pending.push(line);
    } else if (current) {
      current.lines.push(line);
    }
  }
  push();
  return chunks;
}

export function buildIndex(dir) {
  const chunks = [];
  const docRoots = ["llms.txt", "AGENTS.md", "docs", ".agents"];
  for (const root of docRoots) {
    const full = join(dir, root);
    if (!existsSync(full)) continue;
    const files = statSync(full).isDirectory() ? walk(full) : [full];
    for (const file of files) {
      const rel = relative(dir, file).split(sep).join("/");
      if (SKIP.test(rel)) continue;
      const text = readFileSync(file, "utf8");
      if (/recipes-src\/[^/]+\/main\.ts$/.test(rel)) chunks.push({ path: rel, title: rel.split("/").at(-2), kind: "recipe", text });
      else if (/\.(md|txt)$/.test(rel)) {
        if (/api-signatures\.md$/.test(rel)) chunks.push(...chunkMarkdown(text, rel, "sig"));
        else if (/recipes\.md$|first-screen-cheatsheet\.md$/.test(rel)) chunks.push(...chunkMarkdown(text, rel, "recipe"));
        else chunks.push(...chunkMarkdown(text, rel, "doc"));
        if (/recipes\.md$/.test(rel)) chunks.push(...tableRowChunks(text.split("## Type traps")[1] ?? "", rel, "gotcha", () => "type trap"));
        if (/threejs-to-aura3d\.md$/.test(rel)) chunks.push(...tableRowChunks(text, rel, "gotcha", (row) => row.split("|")[1]?.trim().slice(0, 60) ?? "mapping"));
        if (/llms\.txt$/.test(rel)) chunks.push(...bulletChunks(text, rel, "gotcha"));
        if (/first-screen-cheatsheet\.md$/.test(rel)) chunks.push(...bulletChunks(text.replace(/^## Rules/m, "## Pitfalls (rules)"), rel, "gotcha"));
      }
    }
  }
  for (const root of TYPES_DIRS) {
    for (const file of walk(join(dir, root)).filter((f) => f.endsWith(".d.ts"))) {
      chunks.push(...chunkTypes(readFileSync(file, "utf8"), relative(dir, file).split(sep).join("/")));
    }
  }
  const seen = new Set();
  const unique = chunks.filter((c) => {
    const key = `${c.kind}:${c.text.length}:${c.text.slice(0, 200)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const docs = unique.map((c) => {
    const body = tokenize(c.text);
    const head = tokenize(`${c.title} ${c.path}`);
    const tf = new Map();
    for (const t of [...body, ...head, ...head]) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { ...c, tf, len: body.length + 2 * head.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg, n: docs.length };
}

export function search(index, query, kind, limit) {
  const q = [...new Set(tokenize(query))];
  const k1 = 1.2;
  const b = 0.75;
  const scored = [];
  for (const d of index.docs) {
    if (d.kind !== kind) continue;
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (index.n - (index.df.get(t) ?? 0) + 0.5) / ((index.df.get(t) ?? 0) + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / index.avg));
    }
    if (score > 0) scored.push({ d, score });
  }
  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, limit);
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}\n... [clipped]` : text);

/** Build a lookup function bound to one sandbox directory. */
export function createLookup(dir) {
  let index;
  return function lookup(query) {
    index ??= buildIndex(dir);
    const q = String(query ?? "").trim();
    if (!q) return "aura_lookup needs a query, e.g. 'camera orbit autoRotate' or 'custom shader water uniform'.";
    const sections = [];
    for (const [kind, label] of [["recipe", "WORKING SOURCE (copy and adapt)"], ["sig", "EXACT SIGNATURES"], ["gotcha", "GOTCHAS"], ["doc", "RELATED DOC"]]) {
      const hits = search(index, q, kind, LIMITS[kind].n);
      if (!hits.length) continue;
      const body = hits.map(({ d }) => `[${d.path}${d.title && d.title !== d.path ? ` :: ${d.title}` : ""}]\n${clip(d.text, LIMITS[kind].chars)}`).join("\n\n");
      sections.push(`### ${label}\n${body}`);
    }
    if (!sections.length) return `No match for "${q}". Try other keywords (API names such as instances, material.custom, sky, camera.orbit, group, setUniform).`;
    return `aura_lookup("${q}")\n\n${sections.join("\n\n")}`;
  };
}
