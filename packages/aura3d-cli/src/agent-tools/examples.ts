// `aura3d examples <query>`: find a working, runnable scene to copy instead of writing one from memory.
// The index is built at run time from files the CLI already ships (no network, nothing generated to go stale):
//   - the recipe book `skills/agent-docs/recipes.md` (each numbered recipe is a complete, typechecked src/main.ts), and
//   - the create-aura3d templates (`templates/<name>/README.md` + `src/main.ts`), scaffolded with `npx create-aura3d`.
// Ranking is BM25 with camelCase splitting, so "orbit gold metal product" finds the PBR product viewer, plus two nudges:
// a query that names one of the common scene categories (product viewer, character, effect, outdoor, interior, small game,
// materials, presentation) puts that category's runnable starter first, and entries that run as is (no local imports, no
// model assets) rank above ones that need a scaffold. The top hit prints its complete src/main.ts and its setup.
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { cliPackageRoot, findAuraMonorepoRoot, findInstalledPackage, optionNumber, optionValue, positionals, type AgentToolIo } from "./shared.js";

export const EXAMPLES_SCHEMA = "aura3d.examples/1";
export const EXAMPLES_USAGE =
  "aura3d examples <query> [--limit N] [--json] [--no-source]   best matching recipe or template; prints the top hit's complete\n" +
  "                                                             src/main.ts and its setup (start every new scene here)\n" +
  "aura3d examples --list [--json]                              every indexed example\n" +
  "aura3d examples --id <id> [--write src/main.ts] [--force]   one example by id; --write saves its source (a template's\n" +
  "                                                             src/ siblings, aura.assets.json and public/aura-assets too)";

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
  /** The source runs as a project's whole src/main.ts: it imports only `@aura3d/*` packages and needs no model assets. */
  readonly runnable?: boolean;
  /** What the page and project need besides src/main.ts (index.html mount, HDRIs, model assets, sibling files). */
  readonly setup?: readonly string[];
  /** Template directory (templates only): `--write` also copies its other src/ files, aura.assets.json and public/aura-assets. */
  readonly dir?: string;
}

/** The scene categories agents ask for most, each with the runnable starter(s) to begin from (first = best). */
export const EXAMPLE_CATEGORIES: readonly { readonly id: string; readonly label: string; readonly words: RegExp; readonly picks: readonly string[]; readonly defer?: RegExp }[] = [
  { id: "product", label: "product viewer", words: /\b(product|viewer|turntable|showroom|showcase|pedestal|plinth|packshot|car|paint|clearcoat|watch|sneaker|shoe|bottle|jewel\w*|configurator)\b/gi, picks: ["recipe-11-", "template-starter-product"] },
  { id: "rigged-character", label: "rigged character", words: /\b(skinned|skeleton|glb|gltf|crossfade|clips?|mixamo|rigged)\b/gi, picks: ["recipe-3-", "recipe-8-"] },
  { id: "character", label: "character or creature", words: /\b(character|creature|robot|humanoid|spider|insect|animal|dog|cat|bird|walk\w*|legs?|limbs?|joint\w*|articulated|idle)\b/gi, picks: ["recipe-8-", "recipe-3-"] },
  { id: "effect", label: "portal or effect", words: /\b(portal|vortex|glow\w*|effects?|particles?|fire|flames?|smoke|sparks?|magic|energy|bloom|neon|emissive|aura|swirl\w*|explosion|beam)\b/gi, picks: ["recipe-14-", "recipe-15-"] },
  { id: "outdoor", label: "outdoor", words: /\b(outdoor|landscape|terrain|canyon|desert|island|mountains?|hills?|forest|valley|nature|sky|sunset|sunrise|dusk|dawn|flythrough|fly-through|clouds?|ocean|lake|river|water)\b/gi, picks: ["recipe-9-", "recipe-13-", "recipe-12-"] },
  { id: "interior", label: "interior", words: /\b(interior|indoors?|room|kitchen|office|living|bedroom|furniture|clock|gallery|museum|hall|lamp|shelf|window)\b/gi, picks: ["template-starter-interior"] },
  { id: "game", label: "small game", words: /\b(game|score|restart|level|player|stack\w*|arcade|puzzle|platformer|hud|lives|win|lose|game over|tetris|breakout|pong|runner)\b/gi, picks: ["recipe-4-", "recipe-16-"], defer: /\b(racing|racer|kart|driving|fighting|fighter|shooter|arena|falling|blocks|platformer|controller)\b/i },
  { id: "materials", label: "materials", words: /\b(materials?|glass|metal\w*|chrome|gold|silver|copper|fabric|velvet|ceramic|marble|plastic|rubber|wood|pbr|rough\w*|transmission|swatch\w*|spheres?)\b/gi, picks: ["recipe-17-", "template-starter-interior"] },
  { id: "presentation", label: "presentation", words: /\b(presentation|slides?|keynote|explainer|infographic|chart|bars?|data|solar|planets?|orbits?|tour|title|headline|text3d|logo|reveal)\b/gi, picks: ["template-starter-presentation"] }
];

/** Category of a query: the one whose words it uses most (ties go to the earlier category), or undefined. */
export function exampleCategoryOf(query: string): (typeof EXAMPLE_CATEGORIES)[number] | undefined {
  let best: (typeof EXAMPLE_CATEGORIES)[number] | undefined;
  let bestHits = 0;
  for (const category of EXAMPLE_CATEGORIES) {
    const hits = new Set((query.match(category.words) ?? []).map((w) => w.toLowerCase())).size;
    if (hits > bestHits) { best = category; bestHits = hits; }
  }
  return best;
}

const LOCAL_IMPORT = /from\s+["']\.\.?\//;
const MODEL_ASSETS = /\bassets\.\w+|\bmodel\(/;

/** Setup lines for a source: the page mount, HDRIs for looks, model assets, local imports. */
export function exampleSetup(code: string, kind: ExampleEntry["kind"], templateName?: string): string[] {
  const out = ["index.html: a `<canvas id=\"app\">` (or `<div id=\"app\">`) and `<script type=\"module\" src=\"/src/main.ts\">`; createAuraApp(\"#app\") mounts into it."];
  if (/looks\.preset|environments\.(studio|preset|hdri)/.test(code)) out.push("Looks and environments load HDRIs from public/hdri and public/aura-environments (create-aura3d scaffolds ship both); a bare project without them logs 404s.");
  if (LOCAL_IMPORT.test(code) && kind === "template") out.push(`Imports sibling files under src/ (e.g. ./aura-assets); \`aura3d examples --id template-${templateName} --write src/main.ts\` copies them, the template's aura.assets.json and public/aura-assets; or scaffold: npx create-aura3d@latest my-app --template ${templateName}.`);
  if (MODEL_ASSETS.test(code) && !LOCAL_IMPORT.test(code)) out.push("Uses model assets: admit each with `aura3d assets resolve \"<object>\" --name <key>` (writes src/aura-assets.ts), never invent asset paths.");
  if (!LOCAL_IMPORT.test(code) && !MODEL_ASSETS.test(code)) out.push("No model assets and no local imports: the source is the whole src/main.ts.");
  return out;
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
      searchText: [...prose, ...after].join(" "),
      runnable: !LOCAL_IMPORT.test(code) && !MODEL_ASSETS.test(code),
      setup: exampleSetup(code, "recipe")
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
      searchText: `${name.replace(/-/g, " ")} ${text}`,
      runnable: !!code && !LOCAL_IMPORT.test(code) && !MODEL_ASSETS.test(code),
      setup: exampleSetup(code ?? "", "template", name),
      dir: join(templatesDir, name)
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
  const hits = bm25(entries, query);
  // Entries that run as is beat ones that need a scaffold, unless the query asks for a template, assets or a model.
  const wantsScaffold = /\b(template|scaffold|glb|gltf|assets?|models?)\b/i.test(query);
  const scored = hits.map((h) => ({ entry: h.entry, score: wantsScaffold || h.entry.runnable !== false ? h.score : h.score * 0.6 }));
  const category = exampleCategoryOf(query);
  // A genre with its own template (racing, fighting, arena shooter, ...) keeps the plain ranking.
  if (category && !category.defer?.test(query)) {
    const top = Math.max(0, ...scored.map((h) => h.score));
    category.picks.forEach((prefix, rank) => {
      const entry = entries.find((e) => e.id === prefix || e.id.startsWith(prefix));
      if (!entry) return;
      const boost = top + 1 - rank * 0.5;
      const existing = scored.find((h) => h.entry === entry);
      if (existing) existing.score = Math.max(existing.score, boost);
      else scored.push({ entry, score: boost });
    });
  }
  return scored
    .map((h) => ({ entry: h.entry, score: Math.round(h.score * 100) / 100 }))
    .sort((x, y) => y.score - x.score || x.entry.id.localeCompare(y.entry.id))
    .slice(0, limit);
}

/** Plain BM25 over title/summary (weighted 3x) and body/code. */
export function bm25(entries: readonly ExampleEntry[], query: string): ExampleHit[] {
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
    if (score > 0) hits.push({ entry: d.entry, score });
  }
  return hits;
}

function formatHit(hit: ExampleHit, index: number, withSource: boolean, category?: string): string {
  const e = hit.entry;
  const lines = [`${index + 1}. [${e.kind}${e.runnable ? ", runs as is" : ""}] ${e.title}   id: ${e.id}${category ? `   (${category} starter)` : ""}`, `   ${e.summary}`];
  if (!withSource) return [...lines, `   use: ${e.use}`].join("\n");
  lines.push(`   save: aura3d examples --id ${e.id} --write src/main.ts${e.dir && e.code && LOCAL_IMPORT.test(e.code) ? "   (also copies its src/ siblings and assets)" : ""}`);
  for (const line of e.setup ?? []) lines.push(`   setup: ${line}`);
  lines.push("   next: adapt names and numbers, `aura3d validate`, then one `aura3d render`; when render reports done, stop.");
  if (e.code) lines.push("", e.runnable ? "Complete src/main.ts:" : "src/main.ts:", "```ts", e.code, "```");
  return lines.join("\n");
}

/** Copy a template's other src/ files, aura.assets.json and public/aura-assets into the project, never overwriting. */
function copyTemplateSiblings(entry: ExampleEntry, mainTarget: string, projectDir: string): string[] {
  if (!entry.dir) return [];
  const copied: string[] = [];
  const copy = (from: string, to: string): void => {
    if (!existsSync(from) || existsSync(to)) return;
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    copied.push(relative(projectDir, to) || to);
  };
  const srcDir = join(entry.dir, "src");
  if (existsSync(srcDir)) {
    for (const name of readdirSync(srcDir)) {
      if (name === "main.ts") continue;
      copy(join(srcDir, name), join(dirname(mainTarget), name));
    }
  }
  copy(join(entry.dir, "aura.assets.json"), join(projectDir, "aura.assets.json"));
  const assetsDir = join(entry.dir, "public", "aura-assets");
  if (existsSync(assetsDir) && statSync(assetsDir).isDirectory()) {
    for (const name of readdirSync(assetsDir)) copy(join(assetsDir, name), join(projectDir, "public", "aura-assets", name));
  }
  return copied;
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
      const copied = LOCAL_IMPORT.test(entry.code) ? copyTemplateSiblings(entry, target, projectDir) : [];
      io.stdout(json
        ? JSON.stringify({ schema: EXAMPLES_SCHEMA, ok: true, wrote: target, id: entry.id, copied, setup: entry.setup ?? [] }, null, 2)
        : [`Wrote ${entry.id} to ${write}.${copied.length ? ` Copied ${copied.join(", ")}.` : ""}`, ...(entry.setup ?? []).filter((l) => !/^index\.html|whole src\/main\.ts|copies them/.test(l)).map((l) => `setup: ${l}`), "Next: aura3d validate, then one aura3d render; stop when render reports done."].join("\n"));
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
  const category = exampleCategoryOf(query);
  const pinned = (e: ExampleEntry): string | undefined => (category && !category.defer?.test(query) && category.picks.some((p) => e.id === p || e.id.startsWith(p)) ? category.label : undefined);
  if (json) {
    io.stdout(JSON.stringify({ schema: EXAMPLES_SCHEMA, ok: hits.length > 0, query, sources, category: category?.id ?? null, results: hits.map((h, i) => ({ score: h.score, ...h.entry, ...(i > 0 || argv.includes("--no-source") ? { code: undefined, setup: undefined } : {}), searchText: undefined, dir: undefined })) }, null, 2));
    return hits.length > 0 ? 0 : 1;
  }
  if (hits.length === 0) { io.stdout(`No example matches "${query}". Try other words (an object, an effect, a genre) or \`aura3d examples --list\`.`); return 1; }
  io.stdout(hits.map((h, i) => formatHit(h, i, i === 0 && !argv.includes("--no-source"), pinned(h.entry))).join("\n\n"));
  return 0;
}
