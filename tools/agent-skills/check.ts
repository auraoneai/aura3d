// Skills gate (PRD section 8.3). Run: pnpm check:skills
// PRD-13 T2.2 additions: section-order enforcement, forbidden APIs in fenced
// code blocks, visualQA() confinement to failure-gallery.md, craft-ratio
// targets (§6.5), look-recipes row density and quality-bar category coverage.
// The pure rule helpers are exported for tests/unit/tools/agent-skills-check.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CREATE_AURA3D_TEMPLATES, writeAgentSkills, selectSkills, readSkillsManifest } from "../../packages/create-aura3d/src/index";
import { CANONICAL_SKILLS_DIR, SKILL_MIRRORS, expectedMirror, listTree, skillNames } from "./shared";
import { runCraftRatio, type CraftFileReport } from "./craft-ratio";

const MAX_BODY_LINES = 150;
const GITHUB_BLOB = "https://github.com/auraoneai/aura3d/blob/main/";
const SITE = "https://aura3d.auraone.ai/";

// ---------------------------------------------------------------------------
// T2.2 rule data (PRD-13)
// ---------------------------------------------------------------------------

/** Required SKILL.md body sections, in order (T2.1). */
export const REQUIRED_SECTION_ORDER = [
  "Look target",
  "Establish the contract",
  "Procedure",
  "Look-dev loop",
  "Stop and report",
  "References"
] as const;

/** Skills whose SKILL.md must already carry the T2.1 section order. Each
 *  rewrite task (T2.7-T2.11) adds its skill here when it lands. */
export const SECTION_ORDER_SKILLS: ReadonlySet<string> = new Set([
  "aura3d-art-direction",   // T2.3
  "aura3d-core",           // T2.7
  "aura3d-browser-game",   // T2.8
  "aura3d-scene-authoring", // T2.9
  "aura3d-materials-environments" // T2.11
]);

/** Forbidden inside fenced code blocks (T2.2c). Prose mentions stay legal. */
export const FORBIDDEN_FENCED_PATTERNS: readonly { readonly pattern: RegExp; readonly label: string }[] = [
  { pattern: /\bqualityProfile\b/, label: "qualityProfile override" },
  { pattern: /\bpixelRatio\s*:/, label: "pixelRatio override" },
  { pattern: /safe-basic/, label: "safe-basic profile" },
  { pattern: /\bsoftKnee\b/, label: "softKnee" },
  { pattern: /antiAlias\s*\(\s*\{\s*mode\s*:\s*["']fxaa/, label: 'antiAlias({ mode: "fxaa" })' },
  { pattern: /replaceTextures\s*:\s*true/, label: "replaceTextures: true" },
  { pattern: /@aura3d\/lean/, label: "@aura3d/lean" }
];

/** An `lights.ambient(` call inside a fenced block is only legal when the same
 *  block builds a real environment (T2.2c). */
export const AMBIENT_LEGAL_TERMS = ["environments.", "looks.", "world.biome"] as const;

/** `visualQA(` may appear only in the art-direction failure gallery (T2.2d). */
export const VISUAL_QA_ALLOWED_SUFFIX = "aura3d-art-direction/references/failure-gallery.md";
/** Files whose existing visualQA mentions are removed by their own rewrite
 *  tasks (T2.10 evidence-review, T2.11 materials-environments). Entries leave
 *  the set as those rewrites land. */
export const LEGACY_VISUAL_QA_FILES: ReadonlySet<string> = new Set([]);

export const LOOK_RECIPES_FILE = "aura3d-art-direction/references/look-recipes.md";
export const QUALITY_BAR_FILE = "aura3d-art-direction/references/quality-bar.md";
export const RECIPE_DENSITY_MIN = 0.8;

/** The 12 rubric categories quality-bar.md must cover (§7.6 AGENT_LOOK_CATEGORIES;
 *  the C-32 ⊆ check lives in tests/unit/cli/look-judge fixtures in T2.17). */
export const AGENT_LOOK_CATEGORIES = [
  "lighting", "shadows", "ibl_reflections", "environment_world", "atmospheric_effects",
  "material_quality", "modeling_assets", "composition", "camera", "postprocessing",
  "animation_quality", "ui_hud"
] as const;

/** §6.5 craft targets (T2.2b) — enabled with the T2.7-T2.13 rewrites. */
export const ENABLE_CRAFT_TARGETS = true;

/** C-39 registry commands referenced by skills before their T2.16-T2.18 CLI
 *  implementations land (§7.6): `aura3d look capture|judge|rubric|lint`. */
export const REGISTRY_COMMANDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["look", new Set(["capture", "judge", "rubric", "lint"])]
]);
export const REGISTRY_FLAGS: ReadonlySet<string> = new Set([
  "--route", "--shots", "--viewports", "--runner", "--out", "--json",
  "--validate", "--judge", "--genre"
]);

// ---------------------------------------------------------------------------
// Pure rule helpers (unit-tested via fixtures)
// ---------------------------------------------------------------------------

/** (a) Required sections exist in order on a SKILL.md body. */
export function checkSectionOrder(rel: string, text: string): string[] {
  const headings = [...text.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]!.trim());
  const failures: string[] = [];
  let cursor = -1;
  REQUIRED_SECTION_ORDER.forEach((section, i) => {
    const at = headings.indexOf(section);
    if (at === -1) { failures.push(`${rel}: missing required section "## ${section}"`); return; }
    if (at <= cursor) failures.push(`${rel}: section "## ${section}" is out of order`);
    cursor = Math.max(cursor, at);
  });
  return failures;
}

/** Fenced code-block bodies, in file order. */
export function fencedBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      if (current) { blocks.push(current.join("\n")); current = null; }
      else current = [];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(current.join("\n"));
  return blocks;
}

/** (c) Forbidden APIs + ambient-without-environment inside one fenced block. */
export function checkFencedBlock(rel: string, blockIndex: number, block: string): string[] {
  const at = `${rel}:fenced-block-${blockIndex + 1}`;
  const failures: string[] = [];
  if (/lights\.ambient\(/.test(block) && !AMBIENT_LEGAL_TERMS.some((term) => block.includes(term))) {
    failures.push(`${at}: lights.ambient( without environments./looks./world.biome in the same block`);
  }
  for (const { pattern, label } of FORBIDDEN_FENCED_PATTERNS) {
    if (pattern.test(block)) failures.push(`${at}: forbidden ${label} in code block`);
  }
  return failures;
}

/** (d) visualQA( is confined to the failure gallery; legacy files carry their
 *  own removal tasks. */
export function checkVisualQAUsage(rel: string, text: string): string[] {
  if (rel === VISUAL_QA_ALLOWED_SUFFIX || LEGACY_VISUAL_QA_FILES.has(rel)) return [];
  const failures: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (/\bvisualQA\(/.test(line)) failures.push(`${rel}:${i + 1}: visualQA( outside failure-gallery.md (use structuralQA names for structure; visualQA is deprecated)`);
  });
  return failures;
}

/** T2.4 anti-gaming: ≥ 80% of table rows carry a number or a backticked API
 *  name. Table rows = lines starting with `|` that are not the separator or
 *  the header. */
export function checkRecipeDensity(rel: string, text: string): string[] {
  const rows = text.split("\n").filter((l) => /^\s*\|/.test(l) && !/^\s*\|[-:|\s]+\|\s*$/.test(l) && !/Genre/.test(l));
  if (rows.length === 0) return [`${rel}: no genre rows found`];
  const dense = rows.filter((row) => /\d|(?<![a-zA-Z])`(looks\.|assets\.|camera\.|world\.|environments\.|output\.|materials\.|effects\.|lights\.|model\(|assets resolve)/.test(row) || /`(daylight-outdoor|cinematic-film|neon-night|product-studio|arena-fight|space|underwater)`/.test(row));
  if (dense.length / rows.length < RECIPE_DENSITY_MIN) {
    return [`${rel}: ${dense.length}/${rows.length} genre rows carry numbers or API names (need ≥ ${Math.round(RECIPE_DENSITY_MIN * 100)}%)`];
  }
  return [];
}

/** T2.5: quality-bar.md covers all 12 rubric categories. */
export function checkQualityBarCategories(rel: string, text: string): string[] {
  const missing = AGENT_LOOK_CATEGORIES.filter((c) => !new RegExp(`^##\\s+${c}\\s*$`, "m").test(text));
  return missing.length ? [`${rel}: missing rubric categories: ${missing.join(", ")}`] : [];
}

/** (b) §6.5 craft-ratio targets over a craft-ratio report's files. */
export function checkCraftTargets(files: readonly CraftFileReport[]): string[] {
  const sum = (list: readonly CraftFileReport[]) => list.reduce(
    (acc, f) => ({ visual: acc.visual + f.visualOnly, evidence: acc.evidence + f.evidenceOnly }),
    { visual: 0, evidence: 0 });
  const isSkills = (f: CraftFileReport) => f.file.startsWith("packages/aura3d-cli/skills/");
  const skills = sum(files.filter(isSkills));
  const gamePath = sum(files.filter((f) =>
    f.file.startsWith("packages/aura3d-cli/skills/aura3d-browser-game/") ||
    f.file.startsWith("packages/aura3d-cli/skills/aura3d-art-direction/") ||
    f.file === "docs/guides/build-a-browser-game.md" ||
    f.file === "docs/agents/game-example-standards.md"));
  const artDir = sum(files.filter((f) => f.file.startsWith("packages/aura3d-cli/skills/aura3d-art-direction/")));
  const llms = sum(files.filter((f) => f.file === "llms.txt"));
  const failures: string[] = [];
  if (skills.visual < skills.evidence) failures.push(`craft-ratio: skills combined craft ${skills.visual} < evidence ${skills.evidence} (target: craft ≥ evidence)`);
  if (gamePath.visual < 2 * gamePath.evidence) failures.push(`craft-ratio: game path craft ${gamePath.visual} < 2× evidence ${gamePath.evidence}`);
  if (artDir.visual < 3 * artDir.evidence) failures.push(`craft-ratio: aura3d-art-direction craft ${artDir.visual} < 3× evidence ${artDir.evidence}`);
  if (llms.visual < llms.evidence) failures.push(`craft-ratio: llms.txt craft ${llms.visual} < evidence ${llms.evidence}`);
  return failures;
}

/** Parse `id -> status` from CONTRACTS.md Appendix B table text. */
export function parseC40RowStatus(appendixB: string): ReadonlyMap<string, string> {
  const rows = new Map<string, string>();
  for (const m of appendixB.matchAll(/^\|\s*(F-\d{2}-\d{2})\s*\|[^\n]*\|\s*(\w+)\s*\|?\s*$/gm)) {
    rows.set(m[1]!, m[2]!);
  }
  return rows;
}

/** T2.12: skill text may only cite `verified` C-40 rows. */
export function checkFactRowCitations(rowStatus: ReadonlyMap<string, string>, rel: string, text: string): string[] {
  const failures: string[] = [];
  for (const m of text.matchAll(/F-\d{2}-\d{2}/g)) {
    const id = m[0];
    const status = rowStatus.get(id);
    if (status !== "verified") {
      failures.push(`${rel}: cites C-40 row ${id} which is ${status === undefined ? "not in Appendix B" : `status=${status}`} — skill text may only cite verified rows`);
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// File-level checker
// ---------------------------------------------------------------------------

interface CheckCtx {
  readonly repoRoot: string;
  readonly skillsRoot: string;
  readonly sitemap: string;
  readonly helpCommands: ReadonlySet<string>;
  readonly helpFlags: ReadonlySet<string>;
  readonly sceneVerbs: ReadonlySet<string>;
  readonly sceneFlags: ReadonlySet<string>;
  readonly exportSet: ReadonlySet<string>;
  readonly engineNamespaces: ReadonlyMap<string, string>;
  readonly failures: string[];
}
const failIn = (ctx: CheckCtx, msg: string) => ctx.failures.push(msg);

function checkMarkdown(ctx: CheckCtx, skill: string, path: string, isSkill: boolean): void {
  const rel = path.replace(`${ctx.skillsRoot}/`, "");
  const text = readFileSync(path, "utf8");
  if (isSkill) {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!fm) failIn(ctx, `${rel}: missing frontmatter`);
    else {
      const nameLine = /^name:\s*(.+)$/m.exec(fm[1]!)?.[1]?.trim();
      const desc = /^description:\s*(.+)$/m.exec(fm[1]!)?.[1]?.trim() ?? "";
      if (nameLine !== skill) failIn(ctx, `${rel}: frontmatter name "${nameLine}" must equal directory "${skill}"`);
      if (!desc.includes("Use when")) failIn(ctx, `${rel}: description must contain "Use when"`);
      const body = text.slice(fm[0].length).split("\n").length;
      if (body > MAX_BODY_LINES) failIn(ctx, `${rel}: body is ${body} lines (max ${MAX_BODY_LINES})`);
      if (SECTION_ORDER_SKILLS.has(skill)) for (const f of checkSectionOrder(rel, text)) failIn(ctx, f);
    }
  }
  fencedBlocks(text).forEach((block, i) => { for (const f of checkFencedBlock(rel, i, block)) failIn(ctx, f); });
  for (const f of checkVisualQAUsage(rel, text)) failIn(ctx, f);
  if (rel === LOOK_RECIPES_FILE) for (const f of checkRecipeDensity(rel, text)) failIn(ctx, f);
  if (rel === QUALITY_BAR_FILE) for (const f of checkQualityBarCategories(rel, text)) failIn(ctx, f);

  const lines = text.split("\n");
  let inFence = false;
  lines.forEach((line, index) => {
    const at = `${rel}:${index + 1}`;
    if (line.trimStart().startsWith("```")) { inFence = !inFence; return; }
    const codeSpans = inFence ? [line] : [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    for (const code of codeSpans) {
      if (/from ["']three["']|import \* as THREE|new GLTFLoader\(/.test(code) && inFence) failIn(ctx, `${at}: forbidden three.js import/loader in code block`);
      if (/https?:\/\/\S+\.gl(b|tf)\b/i.test(code)) failIn(ctx, `${at}: raw GLB/glTF URL`);
      if (inFence && /unsafeModelUrl\(/.test(code)) failIn(ctx, `${at}: unsafeModelUrl in code block`);
      checkCommands(ctx, at, code);
      if (!inFence) checkApis(ctx, at, code);
    }
    if (/scenario\.com/i.test(line)) failIn(ctx, `${at}: Scenario URL`);
    if (/(sk-[A-Za-z0-9]{20,}|MESHY_API_KEY=\S{8,}|ghp_[A-Za-z0-9]{20,})/.test(line)) failIn(ctx, `${at}: secret-like token`);
    for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) checkLink(ctx, at, path, m[1]!);
  });
}

function checkCommands(ctx: CheckCtx, at: string, code: string): void {
  for (const m of code.matchAll(/(?:^|\s|`)(?:aura3d|npx @aura3d\/cli@[\w.-]+)\s+([a-z][\w-]*)(?:\s+([a-z][\w-]*))?([^|;&]*)/g)) {
    const [top, sub, rest = ""] = [m[1]!, m[2], m[3]];
    const registry = REGISTRY_COMMANDS.get(top);
    if (!ctx.helpCommands.has(top)) {
      if (!registry) { failIn(ctx, `${at}: unknown aura3d command "${top}"`); continue; }
      if (sub && !registry.has(sub)) failIn(ctx, `${at}: unknown "aura3d ${top}" sub-command "${sub}" (C-39 registry)`);
      for (const flag of `${sub ?? ""} ${rest}`.matchAll(/--[a-z][a-z0-9-]*/g)) {
        if (!REGISTRY_FLAGS.has(flag[0])) failIn(ctx, `${at}: unknown flag ${flag[0]} for aura3d ${top} (C-39 registry)`);
      }
      continue;
    }
    if (top === "assets" && sub && !ctx.helpCommands.has(`assets ${sub}`)) failIn(ctx, `${at}: unknown command "assets ${sub}"`);
    const isScene = top === "animation" && sub === "scene";
    if (isScene) {
      const verb = /^\s*([a-z][\w-]*)/.exec(rest)?.[1];
      if (verb && !ctx.sceneVerbs.has(verb)) failIn(ctx, `${at}: unknown animation scene verb "${verb}"`);
    } else if (top === "animation" && sub && !ctx.helpCommands.has(`animation ${sub}`) && !ctx.sitemap.includes(`|${sub}`) && !ctx.sitemap.includes(`${sub}|`)) {
      failIn(ctx, `${at}: unknown animation action "${sub}"`);
    }
    for (const flag of `${sub ?? ""} ${rest}`.matchAll(/--[a-z][a-z0-9-]*/g)) {
      const known = isScene ? ctx.sceneFlags.has(flag[0]) || ctx.helpFlags.has(flag[0]) : ctx.helpFlags.has(flag[0]);
      if (!known) failIn(ctx, `${at}: unknown flag ${flag[0]} for aura3d ${top}${sub ? ` ${sub}` : ""}`);
    }
  }
  for (const m of code.matchAll(/(?:^|\s)animation-scene\s+([a-z][\w-]*)/g)) {
    if (!ctx.sceneVerbs.has(m[1]!)) failIn(ctx, `${at}: unknown animation-scene verb "${m[1]}"`);
  }
}

const JS_BUILTINS = new Set(["import", "require", "console", "setTimeout", "fetch", "expect", "test", "describe", "it", "main", "if", "for", "while", "return", "function", "new", "await", "async", "typeof", "Math", "JSON", "Object", "Array", "String", "Number", "Promise", "Date", "map", "filter", "reduce", "push"]);

function checkApis(ctx: CheckCtx, at: string, code: string): void {
  const call = /^([a-z][A-Za-z0-9]*)\(/.exec(code);
  if (call && !JS_BUILTINS.has(call[1]!) && !ctx.exportSet.has(call[1]!)) failIn(ctx, `${at}: API ${call[1]}( is not exported by any package`);
  const member = /^([a-z][A-Za-z0-9]*)\.([a-zA-Z][A-Za-z0-9]*)/.exec(code);
  if (member && ctx.exportSet.has(member[1]!) && ctx.engineNamespaces.has(member[1]!)) {
    const body = ctx.engineNamespaces.get(member[1]!)!;
    if (!new RegExp(`\\b${member[2]}\\b`).test(body)) failIn(ctx, `${at}: ${member[1]}.${member[2]} is not a member of engine namespace ${member[1]}`);
  }
}

function checkLink(ctx: CheckCtx, at: string, file: string, href: string): void {
  if (href.startsWith("#") || href.startsWith("mailto:")) return;
  if (href.startsWith(GITHUB_BLOB)) {
    const repoPath = href.slice(GITHUB_BLOB.length).split("#")[0]!;
    if (!existsSync(resolve(ctx.repoRoot, repoPath))) failIn(ctx, `${at}: GitHub link target missing in repo: ${repoPath}`);
    return;
  }
  if (href.startsWith(SITE)) {
    if (!ctx.sitemap.includes(href.split("#")[0]!)) failIn(ctx, `${at}: site URL not in sitemap.xml: ${href}`);
    return;
  }
  // External links are allowed — including https://threejs.org/examples/ frames (T2.2e).
  if (/^https?:/.test(href)) return;
  if (/^(\.\.\/)*docs\//.test(href) && !href.startsWith("../")) failIn(ctx, `${at}: repo-relative docs link will not resolve downstream: ${href}`);
  const target = resolve(join(file, ".."), href.split("#")[0]!);
  if (!target.startsWith(ctx.skillsRoot)) failIn(ctx, `${at}: relative link escapes the skills tree: ${href}`);
  else if (!existsSync(target)) failIn(ctx, `${at}: broken relative link ${href}`);
}

function buildExportSet(repoRoot: string): { exportSet: Set<string>; engineNamespaces: Map<string, string> } {
  const set = new Set<string>();
  const engineNamespaces = new Map<string, string>();
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "templates" || entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.ts$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        const src = readFileSync(path, "utf8");
        for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) set.add(m[1]!);
        for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) for (const part of m[1]!.split(",")) {
          const alias = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
          if (alias) set.add(alias);
        }
        if (path.endsWith("packages/engine/src/agent-api/index.ts")) {
          // Namespaces are composed via `...spread` from leaf modules (PR 0 carve-outs),
          // so resolve each spread to the leaf's `export const` object body before
          // checking member names — the barrel body itself no longer lists them.
          const importSources = new Map<string, string>();
          for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+"([^"]+)";/g)) {
            const resolved = resolve(path, "..", m[2]!).replace(/\.js$/, ".ts");
            for (const part of m[1]!.split(",")) {
              const local = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
              if (local) importSources.set(local, resolved);
            }
          }
          const objectBody = (file: string, name: string): string | undefined => {
            if (!existsSync(file)) return undefined;
            const leaf = readFileSync(file, "utf8");
            const leafMatch = leaf.match(new RegExp(`export\\s+const\\s+${name}(?:\\s*:[^=]*)?\\s*=\\s*\\{`));
            if (!leafMatch) return undefined;
            const start = leafMatch.index! + leafMatch[0].length;
            let depth = 1, i = start;
            while (i < leaf.length && depth > 0) { const c = leaf[i++]; if (c === "{") depth++; else if (c === "}") depth--; }
            return leaf.slice(start, i);
          };
          const expandSpreads = (body: string, seen: Set<string>): string => {
            let out = body;
            for (const m of body.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)) {
              const local = m[1]!;
              if (seen.has(local)) continue;
              seen.add(local);
              const file = importSources.get(local);
              if (!file) continue;
              const leafBody = objectBody(file, local);
              if (leafBody !== undefined) out += expandSpreads(leafBody, seen);
            }
            return out;
          };
          for (const m of src.matchAll(/export const ([a-z][A-Za-z0-9]*) = \{/g)) {
            const start = m.index! + m[0].length;
            let depth = 1, i = start;
            while (i < src.length && depth > 0) { const c = src[i++]; if (c === "{") depth++; else if (c === "}") depth--; }
            engineNamespaces.set(m[1]!, expandSpreads(src.slice(start, i), new Set()));
          }
        }
      }
    }
  };
  visit(resolve(repoRoot, "packages"));
  return { exportSet: set, engineNamespaces };
}

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function main(): void {
  const repoRoot = process.cwd();
  const skillsRoot = resolve(repoRoot, CANONICAL_SKILLS_DIR);
  const failures: string[] = [];
  const fail = (msg: string) => failures.push(msg);

  const cliHelp = readFileSync(resolve(repoRoot, "packages/aura3d-cli/src/cli-help.ts"), "utf8");
  const sceneScript = readFileSync(resolve(repoRoot, "packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts"), "utf8");
  const sceneVerbs = new Set([...sceneScript.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]!));
  const sitemap = readFileSync(resolve(repoRoot, "sitemap.xml"), "utf8");
  const helpCommands = new Set<string>();
  for (const m of cliHelp.matchAll(/aura3d ([a-z-]+)(?: ([a-z-]+))?/g)) {
    helpCommands.add(m[1]!);
    if (m[2]) helpCommands.add(`${m[1]} ${m[2]}`);
  }
  const helpFlags = new Set([...cliHelp.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]));
  // Flags consumed by delegated scripts (animation scene verbs) are validated against the scene script.
  const sceneFlags = new Set([...sceneScript.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]));

  const { exportSet, engineNamespaces } = buildExportSet(repoRoot);

  const ctx: CheckCtx = {
    repoRoot, skillsRoot, sitemap, helpCommands, helpFlags, sceneVerbs, sceneFlags, exportSet, engineNamespaces, failures
  };

  const names = skillNames(repoRoot);
  const manifest = readSkillsManifest(skillsRoot);
  for (const name of Object.keys(manifest.skills)) if (!names.includes(name)) fail(`manifest lists missing skill ${name}`);
  for (const name of names) if (!(name in manifest.skills)) fail(`skill ${name} is not in manifest.json`);
  for (const set of [manifest.coreSet, ...Object.values(manifest.templates)]) for (const name of set) if (!(name in manifest.skills)) fail(`manifest references unknown skill ${name}`);
  const templateKeys = Object.keys(manifest.templates).sort();
  if (JSON.stringify(templateKeys) !== JSON.stringify([...CREATE_AURA3D_TEMPLATES].sort())) fail("manifest.templates keys must equal CREATE_AURA3D_TEMPLATES");

  for (const name of names) {
    const dir = join(skillsRoot, name);
    for (const file of listTree(dir).filter((f) => f.endsWith(".md"))) checkMarkdown(ctx, name, join(dir, file), file === "SKILL.md");
  }

  if (ENABLE_CRAFT_TARGETS) {
    for (const f of checkCraftTargets(runCraftRatio(repoRoot).files)) fail(f);
  }

  // T2.12: a skill may cite a C-40 fact row (`F-NN-MM`) only when Appendix B of
  // CONTRACTS.md marks that row `verified`.
  const contractsPath = resolve(repoRoot, "docs/project/aura3d-quality-rebuild/CONTRACTS.md");
  const appendixB = existsSync(contractsPath)
    ? readFileSync(contractsPath, "utf8").split("### Appendix B")[1] ?? ""
    : "";
  const rowStatus = parseC40RowStatus(appendixB);
  for (const name of names) {
    const dir = join(skillsRoot, name);
    for (const file of listTree(dir).filter((f) => f.endsWith(".md"))) {
      for (const f of checkFactRowCitations(rowStatus, `${name}/${file}`, readFileSync(join(dir, file), "utf8"))) fail(f);
    }
  }

  // Boundaries must carry every llms.txt release-integrity rule's key token.
  const boundariesPath = join(skillsRoot, "aura3d-core/references/boundaries.md");
  if (!existsSync(boundariesPath)) fail("aura3d-core/references/boundaries.md missing");
  else {
    const boundaries = readFileSync(boundariesPath, "utf8");
    if (!boundaries.includes("## Forbidden patterns")) fail("boundaries.md missing '## Forbidden patterns' section");
    const llms = readFileSync(resolve(repoRoot, "llms.txt"), "utf8");
    const block = llms.split("Release integrity rules:")[1]?.split(/\n\n/)[0] ?? "";
    for (const token of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.replace(/\(.*$/, ""))) {
      if (!boundaries.includes(token)) fail(`boundaries.md forbidden patterns missing llms.txt token ${token}`);
    }
    for (const word of ["WebGPU", "primitives", "CSS/DOM"]) if (block.includes(word) && !boundaries.includes(word)) fail(`boundaries.md missing llms.txt rule mentioning ${word}`);
  }

  // Mirrors must match canonical source byte-for-byte.
  const expected = expectedMirror(repoRoot);
  if (readIfExists(join(skillsRoot, "llms.txt")) !== expected.get("llms.txt")) fail(`${CANONICAL_SKILLS_DIR}/llms.txt is stale; run pnpm skills:sync`);
  for (const mirror of SKILL_MIRRORS) {
    const root = resolve(repoRoot, mirror);
    const actual = listTree(root);
    for (const file of actual) if (!expected.has(file)) fail(`${mirror}/${file} is not in canonical source; run pnpm skills:sync`);
    for (const [file, contents] of expected) if (readIfExists(join(root, file)) !== contents) fail(`${mirror}/${file} is stale; run pnpm skills:sync`);
  }

  // Package files must ship the bundle.
  for (const pkg of ["packages/aura3d-cli/package.json", "packages/create-aura3d/package.json"]) {
    const files = (JSON.parse(readFileSync(resolve(repoRoot, pkg), "utf8")) as { files?: string[] }).files ?? [];
    if (!files.includes("skills")) fail(`${pkg} files[] must include "skills"`);
  }

  // Init smoke: write into temp dirs and verify the tree + user-edit protection.
  const smoke = mkdtempSync(join(tmpdir(), "aura3d-skills-"));
  const smokeReady = Object.keys(manifest.skills).every((name) => names.includes(name));
  if (!smokeReady) fail("init smoke skipped: manifest skills missing SKILL.md");
  else try {
    const all = writeAgentSkills({ projectDir: smoke, agent: "all", skills: "all", skillsDir: skillsRoot });
    for (const client of Object.values(manifest.clients)) for (const name of names) {
      if (!existsSync(join(smoke, client, name, "SKILL.md"))) fail(`init smoke: ${client}/${name}/SKILL.md not written`);
    }
    if (!existsSync(join(smoke, "llms.txt"))) fail("init smoke: llms.txt not written");
    if (existsSync(join(smoke, ".agents/skills/AUTHORING.md"))) fail("init smoke: authoring notes leaked to user project");
    if (all.skills.length !== names.length) fail("init smoke: --skills all did not select every skill");
    const core = selectSkills(manifest, "core", "fighting-game");
    for (const expectedName of ["aura3d-core", "aura3d-browser-game", "aura3d-character-animation"]) if (!core.includes(expectedName)) fail(`init smoke: core+fighting-game missing ${expectedName}`);
    // T2.11: art-direction in coreSet; materials-environments in every game template.
    const mini = selectSkills(manifest, "core", "mini-game");
    for (const expectedName of ["aura3d-art-direction", "aura3d-materials-environments"]) if (!mini.includes(expectedName)) fail(`init smoke: core+mini-game missing ${expectedName}`);
    const target = join(smoke, ".agents/skills/aura3d-core/SKILL.md");
    writeFileSync(target, "user edit\n");
    const again = writeAgentSkills({ projectDir: smoke, agent: "generic", skills: "all", skillsDir: skillsRoot });
    if (!again.skippedUserModified.includes(target) || readFileSync(target, "utf8") !== "user edit\n") fail("init smoke: user-edited file was overwritten");
  } finally {
    rmSync(smoke, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ ok: failures.length === 0, skills: names, mirrors: SKILL_MIRRORS, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

const invokedAsScript = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedAsScript) main();
