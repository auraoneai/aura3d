// `aura3d examples <query>`: find a working, runnable scene to copy instead of writing one from memory.
// The index is built at run time from files the CLI already ships (no network, nothing generated to go stale):
//   - the recipe book `skills/agent-docs/recipes.md` (each numbered recipe is a complete, typechecked src/main.ts), and
//   - the create-aura3d templates (`templates/<name>/README.md` + `src/main.ts`), scaffolded with `npx create-aura3d`.
// Ranking is plain BM25 with camelCase splitting, so "orbit gold metal product" finds the PBR product viewer.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cliPackageRoot, findAuraMonorepoRoot, findInstalledPackage, optionNumber, optionValue, positionals, type AgentToolIo } from "./shared.js";

export const EXAMPLES_SCHEMA = "aura3d.examples/1";
export const EXAMPLES_USAGE =
  "aura3d examples <query> [--limit N] [--json] [--no-source]   best matching recipe or template; prints the top hit's source\n" +
  "aura3d examples --list [--json]                              every indexed example\n" +
  "aura3d examples --id <id> [--write src/main.ts] [--force]   one example by id; --write saves a recipe's source to a file";

export interface ExampleEntry {
  readonly id: string;
  readonly kind: "recipe" | "template";
  readonly title: string;
  readonly summary: string;
  /** How to run it: where to paste the source, or the scaffold command. */
  readonly use: string;
  /** Where it came from (file and section). */
  readonly origin: string;
  /** Complete source (recipes: the src/main.ts body; templates: their src/main.ts). */
  readonly code?: string;
  /** Extra text that is searched but not printed (template README body). */
  readonly searchText?: string;
}

const slug = (text: string): string => text.toLowerCase().replace(/[`'"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Split the recipe book into numbered recipes: `## N. Title` or `### N. Title`, the bullets/paragraph before the first ```ts block, and that block. */
export function parseRecipeBook(markdown: string, origin = "recipes.md"): ExampleEntry[] {
  const lines = markdown.split("\n");
  const out: ExampleEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^#{2,3}\s+(\d+)\.\s+(.+?)\s*$/.exec(lines[i]!);
    if (!head) continue;
    let j = i + 1;
    const prose: string[] = [];
    const after: string[] = [];
    let code: string | undefined;
    for (; j < lines.length && !/^#{2,3}\s/.test(lines[j]!); j++) {
      if (code === undefined && /^```(ts|typescript|js)\s*$/.test(lines[j]!)) {
        const start = j + 1;
        let end = start;
        while (end < lines.length && !/^```\s*$/.test(lines[end]!)) end++;
        code = lines.slice(start, end).join("\n");
        j = end;
        continue;
      }
      if (lines[j]!.trim()) (code === undefined ? prose : after).push(lines[j]!.trim());
    }
    if (code === undefined) continue;
    const goal = prose.find((p) => /^-\s*Goal:/i.test(p));
    const summary = (goal ? goal.replace(/^-\s*Goal:\s*/i, "") : prose.find((p) => !p.startsWith("-") && !p.startsWith("|")) ?? head[2]!).slice(0, 400);
    out.push({
      id: `recipe-${head[1]}-${slug(head[2]!)}`.slice(0, 70),
      kind: "recipe",
      title: `${head[1]}. ${head[2]}`,
      summary,
      use: "Paste as src/main.ts of a project scaffolded with create-aura3d (the page needs <div id=\"app\">), then `npm run build`.",
      origin: `${origin} §${head[1]}`,
      code,
      searchText: [...prose, ...after].join(" ")
    });
  }
  return out;
}

/** Templates shipped in the create-aura3d package: title and first paragraph of README.md, src/main.ts as searchable source. */
export function readTemplates(templatesDir: string): ExampleEntry[] {
  if (!existsSync(templatesDir)) return [];
  const out: ExampleEntry[] = [];
  for (const name of readdirSync(templatesDir).sort()) {
    const readme = join(templatesDir, name, "README.md");
    if (!existsSync(readme)) continue;
    const text = readFileSync(readme, "utf8");
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? name;
    const paragraphs = text.replace(/^#.*$/m, "").replace(/^>\s?/gm, "").replace(/\*\*/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith("```") && !p.startsWith("#"));
    const summary = (paragraphs[0] ?? title).replace(/\s+/g, " ").slice(0, 400);
    const mainPath = join(templatesDir, name, "src", "main.ts");
    const code = existsSync(mainPath) ? readFileSync(mainPath, "utf8") : undefined;
    out.push({
      id: `template-${name}`,
      kind: "template",
      title: `${title} (template ${name})`,
      summary,
      use: `npx create-aura3d@latest my-app --template ${name} && cd my-app && npm install && npm run dev`,
      origin: `create-aura3d/templates/${name}`,
      ...(code ? { code } : {}),
      searchText: `${name.replace(/-/g, " ")} ${text}`
    });
  }
  return out;
}

export interface ExampleSources { readonly recipeBook?: string; readonly templatesDir?: string }

/** Locate the shipped recipe book and templates: the CLI's own skills/, the installed create-aura3d, else the monorepo copies. */
export function locateExampleSources(projectDir: string): ExampleSources {
  const cliRoot = cliPackageRoot();
  const repo = findAuraMonorepoRoot(projectDir) ?? findAuraMonorepoRoot(cliRoot);
  const recipeCandidates = [join(cliRoot, "skills", "agent-docs", "recipes.md"), ...(repo ? [join(repo, "docs", "agents", "recipes.md")] : [])];
  const createPkg = findInstalledPackage(projectDir, "create-aura3d") ?? findInstalledPackage(cliRoot, "create-aura3d");
  const templateCandidates = [...(createPkg ? [join(createPkg.dir, "templates")] : []), ...(repo ? [join(repo, "packages", "create-aura3d", "templates")] : [])];
  const recipeBook = recipeCandidates.find((p) => existsSync(p));
  const templatesDir = templateCandidates.find((p) => existsSync(p));
  return { ...(recipeBook ? { recipeBook } : {}), ...(templatesDir ? { templatesDir } : {}) };
}

export function loadExampleIndex(sources: ExampleSources): ExampleEntry[] {
  return [
    ...(sources.recipeBook ? parseRecipeBook(readFileSync(sources.recipeBook, "utf8")) : []),
    ...(sources.templatesDir ? readTemplates(sources.templatesDir) : [])
  ];
}

// ---- BM25 -------------------------------------------------------------------------------------------------------------
const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "you", "your", "not", "use", "can", "any", "all", "has", "have", "into", "its", "of", "to", "in", "is", "it", "or", "on", "an", "as", "be", "by", "at", "how", "do", "make", "create", "build", "scene", "aura3d", "engine", "const", "import", "new", "app"]);

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    out.push(word.toLowerCase());
    const parts = word.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").split(" ").map((p) => p.toLowerCase()).filter(Boolean);
    if (parts.length > 1) out.push(...parts);
  }
  // Light stemming so "trees" matches "tree" and "particles" matches "particle".
  return out.filter((t) => t.length > 1 && !STOP.has(t)).map((t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

export interface ExampleHit { readonly entry: ExampleEntry; readonly score: number }

export function searchExamples(entries: readonly ExampleEntry[], query: string, limit = 3): ExampleHit[] {
  const docs = entries.map((entry) => {
    const head = tokenize(`${entry.title} ${entry.id} ${entry.summary}`);
    const body = tokenize(`${entry.searchText ?? ""} ${entry.code ?? ""}`);
    const tf = new Map<string, number>();
    // Title and summary count three times: they describe the result, the code only mentions it.
    for (const t of [...body, ...head, ...head, ...head]) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { entry, tf, len: body.length + 3 * head.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  const q = [...new Set(tokenize(query))];
  const k1 = 1.2, b = 0.75, n = docs.length;
  const hits: ExampleHit[] = [];
  for (const d of docs) {
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / avg));
    }
    if (score > 0) hits.push({ entry: d.entry, score: Math.round(score * 100) / 100 });
  }
  return hits.sort((x, y) => y.score - x.score || x.entry.id.localeCompare(y.entry.id)).slice(0, limit);
}

function formatHit(hit: ExampleHit, index: number, withSource: boolean): string {
  const e = hit.entry;
  const lines = [`${index + 1}. [${e.kind}] ${e.title}   id: ${e.id}   score ${hit.score}`, `   ${e.summary}`, `   use: ${e.use}`, `   from: ${e.origin}`];
  if (withSource && e.code) lines.push("", "```ts", e.code, "```");
  return lines.join("\n");
}

export async function examplesCommand(argv: readonly string[], io: AgentToolIo): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) { io.stdout(EXAMPLES_USAGE); return 0; }
  const json = argv.includes("--json");
  const valueFlags = new Set(["--limit", "--id", "--write", "--project"]);
  const projectDir = resolve(io.cwd, optionValue(argv, "--project") ?? ".");
  const sources = locateExampleSources(projectDir);
  const entries = loadExampleIndex(sources);
  if (entries.length === 0) { io.stderr("No example index found: the CLI's skills/agent-docs/recipes.md and the create-aura3d templates are both missing. Reinstall @aura3d/cli."); return 1; }

  if (argv.includes("--list")) {
    const list = entries.map((e) => ({ id: e.id, kind: e.kind, title: e.title, summary: e.summary }));
    io.stdout(json ? JSON.stringify({ schema: EXAMPLES_SCHEMA, ok: true, sources, count: list.length, examples: list }, null, 2) : list.map((e) => `${e.id.padEnd(48)} ${e.title}`).join("\n"));
    return 0;
  }

  const id = optionValue(argv, "--id");
  if (id) {
    const entry = entries.find((e) => e.id === id) ?? entries.find((e) => e.id.startsWith(id));
    if (!entry) { io.stderr(`No example with id "${id}". Run \`aura3d examples --list\`.`); return 1; }
    const write = optionValue(argv, "--write");
    if (write) {
      if (!entry.code) { io.stderr(`${entry.id} has no source to write; use: ${entry.use}`); return 1; }
      const target = resolve(io.cwd, write);
      if (existsSync(target) && !argv.includes("--force")) { io.stderr(`${write} exists; pass --force to overwrite it.`); return 1; }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, entry.code.endsWith("\n") ? entry.code : `${entry.code}\n`);
      io.stdout(json ? JSON.stringify({ schema: EXAMPLES_SCHEMA, ok: true, wrote: target, id: entry.id }, null, 2) : `Wrote ${entry.id} to ${write}. Next: aura3d validate && aura3d render`);
      return 0;
    }
    io.stdout(json ? JSON.stringify({ schema: EXAMPLES_SCHEMA, ok: true, example: entry }, null, 2) : formatHit({ entry, score: 0 }, 0, true));
    return 0;
  }

  const query = positionals(argv, valueFlags).join(" ").trim();
  if (!query) { io.stderr(`Usage: ${EXAMPLES_USAGE}`); return 2; }
  let limit: number;
  try { limit = Math.max(1, Math.floor(optionNumber(argv, "--limit") ?? 3)); } catch (error) { io.stderr(String((error as Error).message)); return 2; }
  const hits = searchExamples(entries, query, limit);
  if (json) {
    io.stdout(JSON.stringify({ schema: EXAMPLES_SCHEMA, ok: hits.length > 0, query, sources, results: hits.map((h, i) => ({ score: h.score, ...h.entry, ...(i > 0 || argv.includes("--no-source") ? { code: undefined } : {}), searchText: undefined })) }, null, 2));
    return hits.length > 0 ? 0 : 1;
  }
  if (hits.length === 0) { io.stdout(`No example matches "${query}". Try other words (an object, an effect, a genre) or \`aura3d examples --list\`.`); return 1; }
  io.stdout(hits.map((h, i) => formatHit(h, i, i === 0 && !argv.includes("--no-source"))).join("\n\n"));
  return 0;
}
