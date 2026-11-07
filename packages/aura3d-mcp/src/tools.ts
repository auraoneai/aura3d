// The Aura3D MCP tools. Every answer carries the docs bundle version and the installed engine version, and is
// clipped to MAX_ANSWER_CHARS (2,500 tokens at 3.6 chars per token).
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { getSymbol, findInstalledPackage, publicSubpaths, type SymbolAnswer } from "./dts.js";
import type { DocsKnowledge, ErrorRow } from "./docs.js";
import { run, runCli, findBin, type RunResult } from "./runner.js";

export const MAX_ANSWER_CHARS = 8900;

export interface ToolContext {
  readonly knowledge: DocsKnowledge;
  readonly defaultProjectDir: string;
}

export interface ToolResult {
  readonly text: string;
  readonly isError?: boolean;
}

export interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  call(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> | ToolResult;
}

const projectDirProp = { type: "string", description: "Project directory containing node_modules/@aura3d/*. Defaults to the server working directory or AURA3D_PROJECT_DIR." };

function str(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function projectDirOf(args: Record<string, unknown>, ctx: ToolContext): string {
  return resolve(str(args, "projectDir") ?? process.env.AURA3D_PROJECT_DIR ?? ctx.defaultProjectDir);
}

export function clip(text: string, max = MAX_ANSWER_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 80);
  return `${cut.slice(0, cut.lastIndexOf("\n") > max / 2 ? cut.lastIndexOf("\n") : cut.length)}\n... [clipped to stay under 2,500 tokens]`;
}

function stamp(ctx: ToolContext, projectDir: string): string {
  const engine = findInstalledPackage(projectDir, "@aura3d/engine");
  const installed = engine ? `installed @aura3d/engine@${engine.version}` : "no @aura3d/engine installed in the project";
  const mismatch = engine && engine.version !== ctx.knowledge.bundle.docsVersion ? ` (docs describe ${ctx.knowledge.bundle.docsVersion}; where they differ the installed declarations win)` : "";
  return `[aura3d-mcp docs@${ctx.knowledge.bundle.docsVersion} | ${installed}${mismatch}]`;
}

function oneLine(declaration: string, max = 220): string {
  const flat = declaration.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** First fenced code block (or recipe-source window) that calls `name`, for symbols with no @example. */
function exampleFinder(ctx: ToolContext): (name: string) => string | undefined {
  return (name) => {
    const head = name.split(".")[0]!;
    const needle = new RegExp(`\\b${head.replace(/[^A-Za-z0-9_]/g, "")}\\b`);
    for (const file of ctx.knowledge.bundle.files) {
      if (file.kind === "recipe-source") {
        const lines = file.text.split("\n");
        const at = lines.findIndex((l) => needle.test(l) && !/^import /.test(l));
        if (at >= 0) return lines.slice(Math.max(0, at - 1), at + 7).join("\n");
      }
    }
    for (const file of ctx.knowledge.bundle.files) {
      if (file.kind !== "doc" || !/api-signatures|recipes|agent-quickstart/.test(file.path)) continue;
      for (const block of file.text.matchAll(/```ts\n([\s\S]*?)```/g)) {
        const body = block[1]!;
        if (needle.test(body) && body.length < 1400) return body.trim();
      }
    }
    return undefined;
  };
}

function formatSymbol(answer: SymbolAnswer, ctx: ToolContext, projectDir: string): string {
  const header = stamp(ctx, projectDir);
  if (!answer.ok) {
    const lines = [header, `get_symbol failed: ${answer.error}`];
    if (answer.suggestions?.length) lines.push(`Did you mean: ${answer.suggestions.join(", ")}`);
    return lines.join("\n");
  }
  const parts = [header, `${answer.kind} ${answer.name} (${answer.package}@${answer.version}, ${answer.entry})`, "", "Signature:", "```ts", answer.declaration ?? "", "```"];
  if (answer.doc) parts.push("", "Doc:", answer.doc);
  if (answer.defaults?.length) parts.push("", `Defaults: ${answer.defaults.join("; ")}`);
  if (answer.example) parts.push("", "Example:", "```ts", answer.example, "```");
  else parts.push("", "Example: none in the declarations or bundled docs; search_docs or get_recipe has working scenes.");
  return parts.join("\n");
}

const getSymbolTool: ToolDef = {
  name: "get_symbol",
  description: "Exact public signature, doc comment, default values and an example for an Aura3D export, read from the INSTALLED @aura3d/* package declarations (version reported in every answer). name may be dotted for a member, e.g. \"AuraApp.onFrame\".",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Exported symbol, e.g. createAuraApp, lights, camera.orbit, AuraApp.onFrame" },
      subpath: { type: "string", description: "Package subpath such as \"math\" or \"./game\" (must be in the package exports map). Default is the root." },
      package: { type: "string", description: "Package name, default @aura3d/engine. Any installed @aura3d/* package." },
      projectDir: projectDirProp
    },
    required: ["name"]
  },
  call(args, ctx) {
    const name = str(args, "name");
    if (!name) return { text: "get_symbol needs a name, e.g. createAuraApp.", isError: true };
    const projectDir = projectDirOf(args, ctx);
    const answer = getSymbol({ projectDir, name, subpath: str(args, "subpath"), pkg: str(args, "package"), exampleFor: exampleFinder(ctx) });
    return { text: clip(formatSymbol(answer, ctx, projectDir)), isError: !answer.ok };
  }
};

const searchDocsTool: ToolDef = {
  name: "search_docs",
  description: "BM25 search over the version-stamped Aura3D agent docs bundle (llms.txt, quickstart, recipes, api-signatures, three.js to Aura3D table, troubleshooting). Returns the best passages with file paths.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "number", description: "1 to 8, default 4" }, projectDir: projectDirProp },
    required: ["query"]
  },
  call(args, ctx) {
    const query = str(args, "query");
    if (!query) return { text: "search_docs needs a query.", isError: true };
    const limit = Math.min(8, Math.max(1, Math.floor(Number(args.limit ?? 4)) || 4));
    const hits = ctx.knowledge.query(query, ["doc", "recipe-doc", "sig", "gotcha"], limit);
    const header = stamp(ctx, projectDirOf(args, ctx));
    if (!hits.length) return { text: `${header}\nNo match for "${query}". Try API names such as instances, material.custom, sky, camera.orbit, group, setUniform.` };
    const per = Math.floor((MAX_ANSWER_CHARS - 400) / hits.length);
    const body = hits.map(({ chunk, score }, i) => `#${i + 1} [${chunk.path} :: ${chunk.title}] score ${score.toFixed(1)}\n${clip(chunk.text, Math.min(per - 80, 1600))}`);
    return { text: clip(`${header}\n\n${body.join("\n\n")}`) };
  }
};

function importedNames(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@aura3d\/engine["']/g)) {
    for (const part of m[1]!.split(",")) {
      const n = part.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (n && /^[A-Za-z_]\w*$/.test(n)) names.add(n);
    }
  }
  return [...names];
}

const getRecipeTool: ToolDef = {
  name: "get_recipe",
  description: "Best working Aura3D scene source for a task description (for example \"forest of 10000 instanced trees\" or \"water with a custom shader\"), plus one-line signatures of the engine exports it uses, read from the installed package.",
  inputSchema: {
    type: "object",
    properties: { task: { type: "string", description: "What you want to build, in plain words" }, projectDir: projectDirProp },
    required: ["task"]
  },
  call(args, ctx) {
    const task = str(args, "task");
    if (!task) return { text: "get_recipe needs a task description.", isError: true };
    const projectDir = projectDirOf(args, ctx);
    const header = stamp(ctx, projectDir);
    const recipe = ctx.knowledge.query(task, ["recipe"], 1)[0];
    const doc = ctx.knowledge.query(task, ["recipe-doc"], 1)[0];
    if (!recipe && !doc) return { text: `${header}\nNo recipe matches "${task}". Use search_docs with API names.` };
    const parts = [header];
    let source = "";
    if (recipe) {
      source = recipe.chunk.text;
      parts.push(`Working source [${recipe.chunk.path}] (copy and adapt):`, "```ts", clip(source, 4400), "```");
    }
    const names = importedNames(source).slice(0, 10);
    if (names.length) {
      const sigs: string[] = [];
      for (const name of names) {
        const answer = getSymbol({ projectDir, name });
        if (answer.ok && answer.declaration) sigs.push(`- ${oneLine(answer.declaration)}`);
      }
      if (sigs.length) parts.push("", `Signatures (installed ${findInstalledPackage(projectDir, "@aura3d/engine")?.version ?? "n/a"}):`, ...sigs);
      else parts.push("", `Imports used: ${names.join(", ")} (install @aura3d/engine in the project to see signatures here).`);
    }
    if (doc && (!recipe || doc.chunk.text.slice(0, 80) !== source.slice(0, 80))) parts.push("", `Related recipe notes [${doc.chunk.path} :: ${doc.chunk.title}]:`, clip(doc.chunk.text, 1500));
    return { text: clip(parts.join("\n")) };
  }
};

async function loadCreateAura3d(projectDir: string): Promise<Record<string, unknown> | undefined> {
  const pkg = findInstalledPackage(projectDir, "create-aura3d");
  if (!pkg) return undefined;
  try {
    const req = createRequire(join(pkg.dir, "package.json"));
    const entry = (() => {
      try {
        return req.resolve(pkg.dir);
      } catch {
        return join(pkg.dir, "dist", "index.js");
      }
    })();
    if (!existsSync(entry)) return undefined;
    return (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const scaffoldTool: ToolDef = {
  name: "scaffold",
  description: "Create a new Aura3D project from a template using create-aura3d (also writes llms.txt and the Aura3D agent skills). Uses the installed create-aura3d when present, otherwise `npx create-aura3d`. Does not install dependencies.",
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string", description: "Template name, e.g. mini-game, product-viewer, racing-starter" },
      dir: { type: "string", description: "Target directory (relative to projectDir), default aura3d-app" },
      agent: { type: "string", enum: ["claude", "cursor", "copilot", "generic", "all"] },
      projectDir: projectDirProp
    },
    required: ["template"]
  },
  async call(args, ctx) {
    const template = str(args, "template");
    if (!template) return { text: "scaffold needs a template.", isError: true };
    const projectDir = projectDirOf(args, ctx);
    const targetDir = resolve(projectDir, str(args, "dir") ?? "aura3d-app");
    const agent = str(args, "agent") ?? "all";
    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) return { text: JSON.stringify({ ok: false, error: `${targetDir} exists and is not empty.` }, null, 2), isError: true };
    const mod = await loadCreateAura3d(projectDir);
    if (mod && typeof mod.createA3DProject === "function") {
      const templates = (mod.CREATE_AURA3D_TEMPLATES as readonly string[] | undefined) ?? [];
      const resolver = mod.resolveTemplateAlias as ((name: string) => { template: string } | null) | undefined;
      const resolved = resolver ? resolver(template)?.template : templates.includes(template) ? template : undefined;
      if (!resolved) return { text: JSON.stringify({ ok: false, error: `Unknown template "${template}".`, templates }, null, 2), isError: true };
      const result = (mod.createA3DProject as (o: Record<string, unknown>) => { files?: string[]; missingAssets?: unknown[] })({ targetDir, template: resolved, agent, skills: "core" });
      const files = result.files ?? [];
      return { text: clip(JSON.stringify({ ok: true, via: "installed create-aura3d", template: resolved, targetDir, fileCount: files.length, files: files.slice(0, 40), missingAssets: result.missingAssets?.length ?? 0, next: [`cd ${targetDir}`, "npm install", "npm run dev"] }, null, 2)) };
    }
    if (process.env.AURA3D_MCP_NO_NPX === "1") return { text: JSON.stringify({ ok: false, error: "create-aura3d is not installed and npx fallback is disabled." }), isError: true };
    const result = await run("npx", ["--yes", "create-aura3d@latest", targetDir, "--template", template, "--agent", agent], { cwd: projectDir, timeoutMs: 300_000 });
    return { text: clip(JSON.stringify({ ok: result.ok, via: "npx create-aura3d@latest", template, targetDir, stdout: result.stdout.slice(-1500), stderr: result.stderr.slice(-1500) }, null, 2)), isError: !result.ok };
  }
};

function cliText(result: RunResult, extra: Record<string, unknown> = {}): ToolResult {
  const body: Record<string, unknown> = { ok: result.ok, exitCode: result.exitCode, command: result.command, ...extra };
  if (result.json !== undefined) body.result = result.json;
  else {
    body.stdout = result.stdout.slice(0, 3500);
    if (result.stderr) body.stderr = result.stderr.slice(0, 1200);
  }
  if (result.error) body.error = result.error;
  if (result.timedOut) body.timedOut = true;
  return { text: clip(JSON.stringify(body, null, 1)), isError: !result.ok && !result.json };
}

/** Compact report for big JSON results: keep the verdict fields first, then as much of the rest as fits. */
function compactJson(result: RunResult): RunResult {
  const json = result.json as Record<string, unknown> | undefined;
  if (!json || typeof json !== "object" || JSON.stringify(json).length < 6000) return result;
  const keep: Record<string, unknown> = {};
  for (const key of ["ok", "failures", "warnings", "messages", "errors", "summary", "candidates", "asset", "assets", "chosen"]) if (key in json) keep[key] = json[key];
  keep.truncated = `full result had ${Object.keys(json).length} keys; showing verdict fields`;
  return { ...result, json: keep };
}

const assetsResolveTool: ToolDef = {
  name: "assets_resolve",
  description: "Resolve a plain-language asset need (\"robot\", \"oak tree\") to a licence-clear admitted model with `aura3d assets resolve --json`. Returns structured candidates and the typed asset name to use as model(assets.<name>). Default is a dry run; never invent asset paths.",
  inputSchema: {
    type: "object",
    properties: { need: { type: "string" }, name: { type: "string", description: "Typed asset key to create, e.g. robot" }, role: { type: "string", enum: ["hero", "prop", "background", "character", "texture", "hdri"] }, dryRun: { type: "boolean", description: "Default true: show what would be admitted without writing" }, projectDir: projectDirProp },
    required: ["need"]
  },
  async call(args, ctx) {
    const need = str(args, "need");
    if (!need) return { text: "assets_resolve needs a need.", isError: true };
    const projectDir = projectDirOf(args, ctx);
    const cli = ["assets", "resolve", need, "--json"];
    const name = str(args, "name");
    const role = str(args, "role");
    if (name) cli.push("--name", name);
    if (role) cli.push("--role", role);
    if (args.dryRun !== false) cli.push("--dry-run");
    return cliText(compactJson(await runCli(projectDir, cli, 180_000)), { version: stamp(ctx, projectDir) });
  }
};

const assetsInspectTool: ToolDef = {
  name: "assets_inspect",
  description: "Inspect a local GLB/glTF with `aura3d assets inspect`: bounds, triangle and material counts, textures, optional animation/skeleton/morph/licence detail, as structured JSON.",
  inputSchema: {
    type: "object",
    properties: { file: { type: "string", description: "Path to the model, relative to projectDir" }, animation: { type: "boolean" }, skeleton: { type: "boolean" }, morphs: { type: "boolean" }, license: { type: "boolean" }, projectDir: projectDirProp },
    required: ["file"]
  },
  async call(args, ctx) {
    const file = str(args, "file");
    if (!file) return { text: "assets_inspect needs a file.", isError: true };
    const projectDir = projectDirOf(args, ctx);
    const abs = resolve(projectDir, file);
    if (!existsSync(abs)) return { text: JSON.stringify({ ok: false, error: `${abs} does not exist.` }), isError: true };
    const cli = ["assets", "inspect", abs];
    for (const flag of ["animation", "skeleton", "morphs", "license"]) if (args[flag] === true) cli.push(`--${flag}`);
    return cliText(compactJson(await runCli(projectDir, cli, 120_000)), { version: stamp(ctx, projectDir) });
  }
};

const checkDeployTool: ToolDef = {
  name: "check_deploy",
  description: "Run `aura3d check-deploy --dist <dir>` against a built site and return ok, failures and warnings as structured JSON. Build first (npm run build).",
  inputSchema: {
    type: "object",
    properties: { dist: { type: "string", description: "Built output directory, default dist" }, release: { type: "boolean" }, projectDir: projectDirProp },
    required: []
  },
  async call(args, ctx) {
    const projectDir = projectDirOf(args, ctx);
    const dist = str(args, "dist") ?? "dist";
    if (!existsSync(resolve(projectDir, dist))) return { text: JSON.stringify({ ok: false, error: `${resolve(projectDir, dist)} does not exist. Run the build first (npm run build).` }), isError: true };
    const cli = ["check-deploy", "--dist", dist];
    if (args.release === true) cli.push("--release");
    return cliText(compactJson(await runCli(projectDir, cli, 180_000)), { version: stamp(ctx, projectDir) });
  }
};

export function lookupError(rows: readonly ErrorRow[], input: string): { row?: ErrorRow; others: ErrorRow[] } {
  const wanted = input.trim();
  const lower = wanted.toLowerCase();
  const exact = rows.find((r) => r.code.toLowerCase() === lower);
  if (exact) return { row: exact, others: [] };
  const inside = rows.filter((r) => lower.includes(r.code.toLowerCase()));
  if (inside.length) return { row: inside.sort((a, b) => b.code.length - a.code.length)[0], others: inside.slice(1) };
  const partial = rows.filter((r) => r.code.toLowerCase().includes(lower) || (lower.length > 5 && r.cause.toLowerCase().includes(lower)));
  return { row: partial[0], others: partial.slice(1, 6) };
}

const explainErrorTool: ToolDef = {
  name: "explain_error",
  description: "Explain an Aura3D error or warning code (RENDERER_MOUNT_FAILED, any *_DEGRADED code, CONTACT_SHADOW_PARTIAL, KTX2_CSP_BLOCKED, CAMERA_INFINITE_FAR_UNSUPPORTED, DEPTH_POSTPROCESS_UNSUPPORTED, AssetIntegrityError, runtime error codes) with cause and fix. You may paste the whole console line.",
  inputSchema: { type: "object", properties: { code: { type: "string" }, projectDir: projectDirProp }, required: ["code"] },
  call(args, ctx) {
    const code = str(args, "code");
    if (!code) return { text: "explain_error needs a code or the error text.", isError: true };
    const header = stamp(ctx, projectDirOf(args, ctx));
    const { row, others } = lookupError(ctx.knowledge.errors, code);
    if (!row) return { text: `${header}\nNo entry for "${code.slice(0, 80)}". Known codes: ${ctx.knowledge.errors.map((r) => r.code).join(", ")}`, isError: true };
    const lines = [header, `${row.code} (${row.kind})`, `Cause: ${row.cause}`, `Fix: ${row.fix}`];
    if (others.length) lines.push(`Also mentioned: ${others.map((r) => r.code).join(", ")}`);
    return { text: clip(lines.join("\n")) };
  }
};

export const TOOLS: readonly ToolDef[] = [getSymbolTool, searchDocsTool, getRecipeTool, scaffoldTool, assetsResolveTool, assetsInspectTool, checkDeployTool, explainErrorTool];

export interface ResourceDef {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
}

export const RESOURCES: readonly ResourceDef[] = [
  { uri: "aura3d://llms.txt", name: "llms.txt", description: "Aura3D in one page for agents: the API shape, pitfalls and where to go next.", path: "llms.txt" },
  { uri: "aura3d://docs/threejs-to-aura3d", name: "three.js to Aura3D translation table", description: "Each three.js idiom and the Aura3D call to write instead, with the difference that bites.", path: "docs/agents/threejs-to-aura3d.md" },
  { uri: "aura3d://docs/api-signatures", name: "API signature tables", description: "Answer-first signatures of the public engine API.", path: "docs/agents/api-signatures.md" },
  { uri: "aura3d://docs/error-codes", name: "Error and warning codes", description: "Cause and fix for every Aura3D error and warning code.", path: "docs/agents/error-codes.md" }
];

export { findBin, publicSubpaths };
