/**
 * `aura3d assets resolve "<need>"`: a build-time decision ladder for one asset need.
 *
 * Rungs, in order: (1) an asset already admitted in this project, (2) a directly
 * downloadable, licence-clear model, texture or HDRI from open sources (Khronos samples,
 * Poly Haven, ambientCG, the jsDelivr CC0 mirror), (3) Meshy generation from a text
 * prompt, only with `--allow meshy` and a budget that covers the estimate, (4) a
 * procedural recipe the agent pastes into its scene (primitives, built in code like
 * three.js geometry). Nothing is fetched or generated at runtime: every rung that
 * produces a file goes through admission (sha256, provenance, licence) and typegen.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAssetManifest } from "./asset-manifest.js";
import type { AuraCliAssetEntry, AuraCliAssetManifest } from "./asset-core-types.js";
import { runResolve, type ResolveReport } from "./pull-bridge.js";
import { runSearch, type SearchCandidateLine, type SearchReport } from "./pull-bridge/search.js";
import type { CliAssetSearchProfile, CliResolveConstraints } from "./pull-bridge/types.js";

export type LadderRole = "hero" | "prop" | "background" | "character" | "texture" | "hdri";
export type LadderRung = "project" | "open-source" | "meshy" | "procedural";

export const LADDER_ROLES: readonly LadderRole[] = ["hero", "prop", "background", "character", "texture", "hdri"];

/** Meshy credits per role: preview 20 + refine 10; characters add rig 5 + one animation 3. */
export const MESHY_CREDIT_ESTIMATE: Readonly<Record<LadderRole, number>> = {
  hero: 30,
  prop: 30,
  background: 30,
  character: 38,
  texture: 10,
  hdri: 0,
};

/** Triangle budgets per role (docs/agents/asset-workflow.md). */
export const ROLE_TRIANGLE_BUDGET: Readonly<Record<LadderRole, number | undefined>> = {
  hero: 40_000,
  prop: 6_000,
  background: 15_000,
  character: 30_000,
  texture: undefined,
  hdri: undefined,
};

export interface LadderSkip {
  readonly rung: LadderRung;
  readonly reason: string;
}

export interface LadderReport {
  readonly ok: boolean;
  readonly need: string;
  readonly headNoun: string | undefined;
  readonly role: LadderRole;
  readonly chosen: LadderRung;
  readonly reason: string;
  readonly skipped: readonly LadderSkip[];
  readonly costCredits: number;
  readonly dryRun: boolean;
  readonly name: string;
  /** Rung 1: the admitted entry to use as `assets.<id>`. */
  readonly projectAsset?: { readonly id: string; readonly url: string; readonly sizeBytes: number };
  /** Rung 2: the chosen open-source candidate (with triangles and size when the source reports them). */
  readonly candidate?: SearchCandidateLine;
  /** Rung 2/3: the admission result when a file was produced. */
  readonly resolve?: ResolveReport;
  /** Rung 3: the prompt and the commands to run (or that were run). */
  readonly meshy?: { readonly prompt: string; readonly estimateCredits: number; readonly commands: readonly string[]; readonly ran: boolean };
  /** Rung 4: a paste-ready procedural snippet. */
  readonly procedural?: { readonly recipe: string; readonly snippet: string };
  readonly messages: readonly string[];
  readonly warnings: readonly string[];
}

export interface LadderOptions {
  readonly need: string;
  readonly name?: string;
  readonly role?: LadderRole;
  readonly budget?: number;
  readonly allowMeshy?: boolean;
  readonly dryRun?: boolean;
  readonly projectDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly constraints?: CliResolveConstraints;
  /** Test seams. */
  readonly readManifest?: (projectDir: string) => AuraCliAssetManifest;
  readonly searchFn?: typeof runSearch;
  readonly resolveFn?: typeof runResolve;
  readonly meshyRunner?: MeshyRunner;
}

/**
 * Runs a configured Meshy generator. The default reads `AURA3D_MESHY_CMD`: an executable that
 * accepts `--prompt <text> --out <dir> --budget <credits>`, generates through the team's
 * credentialed path (for example Kiro Prism with ledger caps) and writes a GLB plus its
 * metadata and rights evidence into `<dir>`. The CLI never handles Meshy credentials itself.
 */
export type MeshyRunner = (input: { readonly prompt: string; readonly outDir: string; readonly budget: number; readonly env: NodeJS.ProcessEnv }) => {
  readonly ok: boolean;
  readonly message: string;
};

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "for", "with", "and", "or", "in", "on", "to", "my", "some",
  "low", "poly", "lowpoly", "high", "detailed", "simple", "stylised", "stylized", "realistic",
  "small", "large", "big", "tiny", "old", "new", "model", "asset", "glb", "gltf", "3d", "game", "pbr",
]);

/** Singular form good enough for matching English asset nouns. */
export function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * The head noun of an English need: the last content word. "wooden bridge" -> "bridge",
 * "street lamp" -> "lamp", "oak tree" -> "tree", "sports car" -> "car".
 */
export function headNoun(need: string): string | undefined {
  const words = tokens(need).filter((word) => !STOP_WORDS.has(word) && !/^\d+$/.test(word));
  const last = words.at(-1);
  return last === undefined ? undefined : singular(last);
}

/** True when `text` (a title, id or tag list) contains the head noun. */
export function mentionsNoun(text: string, noun: string): boolean {
  const words = new Set(tokens(text).map(singular));
  return words.has(noun) || tokens(text).some((word) => word.startsWith(noun) && word.length <= noun.length + 3);
}

function camelName(need: string): string {
  const words = tokens(need).filter((word) => !STOP_WORDS.has(word));
  const base = (words.length > 0 ? words : ["asset"]).slice(-3);
  const name = base.map((word, index) => (index === 0 ? word : word[0]!.toUpperCase() + word.slice(1))).join("");
  return /^[a-z_]/.test(name) ? name : `asset${name[0]!.toUpperCase()}${name.slice(1)}`;
}

function entryText(entry: AuraCliAssetEntry): string {
  return [entry.id, entry.source, ...(entry.nodeNames ?? []), entry.suitabilityReason ?? ""].join(" ");
}

function profileFor(role: LadderRole): CliAssetSearchProfile {
  if (role === "character") return "animation-character";
  return "general";
}

function searchQuery(need: string, role: LadderRole): string {
  if (role === "texture" && !/\btextures?\b/i.test(need)) return `${need} texture`;
  if (role === "hdri" && !/\bhdri?\b/i.test(need)) return `${need} hdri`;
  return need;
}

function fitsRole(candidate: SearchCandidateLine, role: LadderRole): string | undefined {
  if (role === "texture" && candidate.format !== undefined && candidate.format !== "texture-set" && candidate.format !== "image") {
    return `format ${candidate.format} is not a texture`;
  }
  if (role === "hdri" && candidate.format !== undefined && candidate.format !== "hdr") return `format ${candidate.format} is not an HDRI`;
  if ((role === "hero" || role === "prop" || role === "background" || role === "character") && (candidate.format === "texture-set" || candidate.format === "image" || candidate.format === "hdr")) {
    return `format ${candidate.format} is not a model`;
  }
  const budget = ROLE_TRIANGLE_BUDGET[role];
  if (budget !== undefined && typeof candidate.triangles === "number" && candidate.triangles > budget) {
    return `${candidate.triangles} triangles exceeds the ${role} budget of ${budget}`;
  }
  return undefined;
}

export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "size unknown";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function describeCandidate(candidate: SearchCandidateLine): string {
  const triangles = typeof candidate.triangles === "number" ? `${candidate.triangles.toLocaleString("en-US")} triangles` : "triangles unknown";
  return `${candidate.title} (${candidate.id}, ${candidate.license}, ${triangles}, ${formatSize(candidate.sizeBytes)})`;
}

const defaultMeshyRunner: MeshyRunner = ({ prompt, outDir, budget, env }) => {
  const command = env["AURA3D_MESHY_CMD"];
  if (!command) {
    return { ok: false, message: "AURA3D_MESHY_CMD is not set: run the printed Meshy commands yourself, then `aura3d assets import-meshy`." };
  }
  // No shell: the prompt is passed as a single argument, never interpolated into a command line.
  const run = spawnSync(command, ["--prompt", prompt, "--out", outDir, "--budget", String(budget)], { env, encoding: "utf8" });
  if (run.status !== 0) return { ok: false, message: `${command} exited ${String(run.status)}: ${(run.stderr || run.stdout || "").trim().slice(0, 400)}` };
  return { ok: true, message: (run.stdout || "").trim().slice(0, 400) };
};

export function meshyPrompt(need: string, role: LadderRole): string {
  const base = need.trim();
  const style = "stylised, clean topology, game-ready, matte flat colours, no text, no logos, no brand marks";
  if (role === "character") return `${base}, single humanoid character in A-pose, full body, ${style}`;
  if (role === "texture") return `${base}, seamless tileable surface`;
  return `${base}, single solid closed object, ${style}`;
}

export async function runResolveLadder(options: LadderOptions): Promise<LadderReport> {
  const need = options.need.trim();
  if (!need) throw new Error('Usage: aura3d assets resolve "<need>" [--name <id>] [--role hero|prop|background|character|texture|hdri] [--budget credits] [--allow meshy] [--dry-run]');
  const projectDir = options.projectDir ?? process.cwd();
  const env = options.env ?? process.env;
  const role: LadderRole = options.role ?? "prop";
  const name = options.name ?? camelName(need);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Aura3D resolve failed: --name must be a valid identifier (got "${name}").`);
  const dryRun = options.dryRun === true;
  const noun = headNoun(need);
  const skipped: LadderSkip[] = [];
  const warnings: string[] = [];
  const messages: string[] = [];
  const base = { need, headNoun: noun, role, dryRun, name, skipped, warnings, messages };

  // Rung 1: already admitted in this project.
  const manifest = (options.readManifest ?? readAssetManifest)(projectDir);
  const wantsModel = role !== "texture" && role !== "hdri";
  const local = noun === undefined ? undefined : manifest.assets.find((entry) => {
    if (wantsModel && entry.type !== "model") return false;
    if (role === "texture" && entry.type !== "texture") return false;
    if (role === "hdri" && entry.type !== "environment" && entry.format !== "hdr") return false;
    return entry.id === name || mentionsNoun(entryText(entry), noun);
  });
  if (local) {
    messages.push(`Use the admitted asset: model(assets.${local.id}) (${formatSize(local.sizeBytes)}, ${local.hash}).`);
    return { ...base, ok: true, chosen: "project", reason: `"${local.id}" is already admitted in this project and matches "${noun}".`, costCredits: 0, projectAsset: { id: local.id, url: local.url, sizeBytes: local.sizeBytes } };
  }
  skipped.push({ rung: "project", reason: noun === undefined ? "the need has no noun to match" : `no admitted asset matches "${noun}"` });

  // Rung 2: open, licence-clear sources.
  const query = searchQuery(need, role);
  let search: SearchReport | undefined;
  try {
    search = await (options.searchFn ?? runSearch)({ query, constraints: { ...options.constraints, profile: options.constraints?.profile ?? profileFor(role) } });
    for (const warning of search.warnings) warnings.push(warning);
  } catch (error) {
    warnings.push(`open-source search failed: ${(error as Error).message}`);
  }
  const rejected: string[] = [];
  const candidate = search?.candidates.find((line) => {
    if (!line.autoPullable) return false;
    if (noun !== undefined && !mentionsNoun(`${line.title} ${line.id}`, noun)) {
      rejected.push(`${line.title}: does not mention "${noun}"`);
      return false;
    }
    const misfit = fitsRole(line, role);
    if (misfit) {
      rejected.push(`${line.title}: ${misfit}`);
      return false;
    }
    return true;
  });
  if (candidate) {
    messages.push(`Open source: ${describeCandidate(candidate)}.`);
    if (dryRun) {
      messages.push(`Dry run: would admit it as assets.${name} with sha256, provenance and licence.`);
      return { ...base, ok: true, chosen: "open-source", reason: `licence-clear match for "${noun ?? need}" from ${candidate.source}`, costCredits: 0, candidate };
    }
    const resolved = await (options.resolveFn ?? runResolve)({ query, name, projectDir, candidateId: candidate.id, constraints: { ...options.constraints, profile: options.constraints?.profile ?? profileFor(role) } });
    for (const message of resolved.messages) messages.push(message);
    for (const warning of resolved.warnings) warnings.push(warning);
    if (resolved.ok) {
      return { ...base, ok: true, chosen: "open-source", reason: `licence-clear match for "${noun ?? need}" from ${candidate.source}`, costCredits: 0, candidate, resolve: resolved };
    }
    skipped.push({ rung: "open-source", reason: `admission of ${candidate.id} failed` });
  } else {
    const detail = rejected.length > 0 ? `; rejected: ${rejected.slice(0, 3).join("; ")}` : "";
    skipped.push({ rung: "open-source", reason: `no licence-clear, downloadable match for "${noun ?? need}"${detail}` });
  }

  // Rung 3: Meshy, only when allowed and within budget.
  const estimate = MESHY_CREDIT_ESTIMATE[role];
  const prompt = meshyPrompt(need, role);
  if (role === "hdri") {
    skipped.push({ rung: "meshy", reason: "Meshy does not generate HDRIs" });
  } else if (!options.allowMeshy) {
    skipped.push({ rung: "meshy", reason: `needs --allow meshy (estimate ${estimate} credits)` });
  } else if ((options.budget ?? 0) < estimate) {
    skipped.push({ rung: "meshy", reason: `--budget ${options.budget ?? 0} is below the ${estimate}-credit estimate` });
  } else {
    const outDir = mkdtempSync(join(tmpdir(), "aura3d-meshy-"));
    const commands = [
      `<your Meshy generator> --prompt ${JSON.stringify(prompt)} --out ${outDir} --budget ${estimate}`,
      `aura3d assets import-meshy --input ${outDir} --name ${name} --role ${role === "character" ? "character" : "prop"}`,
      "aura3d assets validate && aura3d assets typegen",
    ];
    if (dryRun) {
      messages.push(`Dry run: would generate with Meshy for about ${estimate} credits.`);
      return { ...base, ok: true, chosen: "meshy", reason: `no project or open-source match; Meshy allowed within budget`, costCredits: 0, meshy: { prompt, estimateCredits: estimate, commands, ran: false } };
    }
    const runner = options.meshyRunner ?? defaultMeshyRunner;
    const ran = runner({ prompt, outDir, budget: estimate, env });
    messages.push(ran.message);
    const produced = existsSync(outDir) && readdirSync(outDir).some((file) => /\.glb$/i.test(file));
    if (ran.ok && produced) {
      messages.push(`Generated into ${outDir}. Admit it: ${commands[1]}, then ${commands[2]}.`);
      return { ...base, ok: true, chosen: "meshy", reason: "no project or open-source match; generated with Meshy within budget", costCredits: estimate, meshy: { prompt, estimateCredits: estimate, commands: commands.slice(1), ran: true } };
    }
    skipped.push({ rung: "meshy", reason: ran.ok ? "the generator produced no GLB" : ran.message });
    messages.push(`Meshy plan (not run): ${commands.join("  then  ")}`);
  }

  // Rung 4: procedural recipe, always available.
  const procedural = proceduralRecipe(need, name);
  messages.push(`Build it in code (${procedural.recipe} recipe): paste the snippet and add \`${name}\` to your scene.`);
  return { ...base, ok: true, chosen: "procedural", reason: "no admitted, open-source or generated asset; build from primitives", costCredits: 0, procedural };
}

interface RecipePart {
  readonly shape: "box" | "cylinder" | "sphere" | "cone";
  readonly size?: readonly [number, number, number] | number;
  readonly params?: Readonly<Record<string, number>>;
  readonly color: string;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly at: readonly [number, number, number];
}

/** Keyword -> parts, in metres, standing on y = 0. */
export const PROCEDURAL_RECIPES: Readonly<Record<string, readonly RecipePart[]>> = {
  crate: [{ shape: "box", size: [1, 1, 1], color: "#8a5a2b", roughness: 0.85, at: [0, 0.5, 0] }],
  barrel: [
    { shape: "cylinder", size: [0.7, 1, 0.7], color: "#7a4a24", roughness: 0.8, at: [0, 0.5, 0] },
    { shape: "cylinder", size: [0.74, 0.06, 0.74], color: "#3c3c40", metallic: 0.8, roughness: 0.4, at: [0, 0.2, 0] },
    { shape: "cylinder", size: [0.74, 0.06, 0.74], color: "#3c3c40", metallic: 0.8, roughness: 0.4, at: [0, 0.8, 0] },
  ],
  table: [
    { shape: "box", size: [1.6, 0.08, 0.9], color: "#9a6b3f", roughness: 0.7, at: [0, 0.74, 0] },
    { shape: "box", size: [0.08, 0.7, 0.08], color: "#7a5230", at: [-0.7, 0.35, -0.35] },
    { shape: "box", size: [0.08, 0.7, 0.08], color: "#7a5230", at: [0.7, 0.35, -0.35] },
    { shape: "box", size: [0.08, 0.7, 0.08], color: "#7a5230", at: [-0.7, 0.35, 0.35] },
    { shape: "box", size: [0.08, 0.7, 0.08], color: "#7a5230", at: [0.7, 0.35, 0.35] },
  ],
  chair: [
    { shape: "box", size: [0.5, 0.06, 0.5], color: "#9a6b3f", at: [0, 0.45, 0] },
    { shape: "box", size: [0.5, 0.5, 0.06], color: "#9a6b3f", at: [0, 0.73, -0.22] },
    { shape: "box", size: [0.05, 0.45, 0.05], color: "#7a5230", at: [-0.21, 0.22, -0.21] },
    { shape: "box", size: [0.05, 0.45, 0.05], color: "#7a5230", at: [0.21, 0.22, -0.21] },
    { shape: "box", size: [0.05, 0.45, 0.05], color: "#7a5230", at: [-0.21, 0.22, 0.21] },
    { shape: "box", size: [0.05, 0.45, 0.05], color: "#7a5230", at: [0.21, 0.22, 0.21] },
  ],
  tree: [
    { shape: "cylinder", size: [0.3, 2, 0.3], color: "#5a3d24", roughness: 0.95, at: [0, 1, 0] },
    { shape: "cone", params: { radius: 1.2, height: 2.6 }, color: "#3f7a3a", roughness: 0.9, at: [0, 3.2, 0] },
  ],
  rock: [
    { shape: "sphere", size: 1.2, color: "#7d7a74", roughness: 1, at: [0, 0.4, 0] },
    { shape: "sphere", size: 0.7, color: "#6f6c66", roughness: 1, at: [0.5, 0.25, 0.2] },
  ],
  fence: [
    { shape: "box", size: [0.1, 1, 0.1], color: "#8b6a45", at: [-1, 0.5, 0] },
    { shape: "box", size: [0.1, 1, 0.1], color: "#8b6a45", at: [0, 0.5, 0] },
    { shape: "box", size: [0.1, 1, 0.1], color: "#8b6a45", at: [1, 0.5, 0] },
    { shape: "box", size: [2.2, 0.1, 0.05], color: "#a07c52", at: [0, 0.75, 0] },
    { shape: "box", size: [2.2, 0.1, 0.05], color: "#a07c52", at: [0, 0.35, 0] },
  ],
  lamp: [
    { shape: "cylinder", size: [0.12, 3.2, 0.12], color: "#2e3238", metallic: 0.8, roughness: 0.4, at: [0, 1.6, 0] },
    { shape: "box", size: [0.5, 0.12, 0.3], color: "#2e3238", metallic: 0.8, roughness: 0.4, at: [0.2, 3.25, 0] },
    { shape: "sphere", size: 0.22, color: "#ffe9b0", roughness: 0.3, at: [0.35, 3.13, 0] },
  ],
  building: [
    { shape: "box", size: [8, 12, 8], color: "#b9b2a6", roughness: 0.9, at: [0, 6, 0] },
    { shape: "box", size: [8.4, 0.4, 8.4], color: "#6f6a62", at: [0, 12.2, 0] },
  ],
  car: [
    { shape: "box", size: [1.8, 0.6, 4.2], color: "#c0392b", roughness: 0.5, metallic: 0.3, at: [0, 0.55, 0] },
    { shape: "box", size: [1.6, 0.5, 2.2], color: "#2c3e50", roughness: 0.2, at: [0, 1.05, -0.2] },
    { shape: "cylinder", size: [0.66, 0.24, 0.66], color: "#1b1b1b", at: [-0.9, 0.33, 1.3] },
    { shape: "cylinder", size: [0.66, 0.24, 0.66], color: "#1b1b1b", at: [0.9, 0.33, 1.3] },
    { shape: "cylinder", size: [0.66, 0.24, 0.66], color: "#1b1b1b", at: [-0.9, 0.33, -1.3] },
    { shape: "cylinder", size: [0.66, 0.24, 0.66], color: "#1b1b1b", at: [0.9, 0.33, -1.3] },
  ],
};

const RECIPE_ALIASES: Readonly<Record<string, string>> = {
  box: "crate", chest: "crate", cask: "barrel", keg: "barrel", desk: "table", bench: "chair", stool: "chair",
  pine: "tree", oak: "tree", bush: "tree", boulder: "rock", stone: "rock", wall: "fence", railing: "fence",
  streetlight: "lamp", light: "lamp", lantern: "lamp", post: "lamp", house: "building", tower: "building", block: "building",
  vehicle: "car", truck: "car", van: "car", taxi: "car", sedan: "car",
};

/** The best recipe for a need: the head noun, then any other word, then aliases; a crate as the fallback. */
export function pickRecipe(need: string): string {
  const words = tokens(need).map(singular);
  const ordered = [headNoun(need), ...words.reverse()].filter((word): word is string => word !== undefined);
  for (const word of ordered) {
    if (PROCEDURAL_RECIPES[word]) return word;
    const alias = RECIPE_ALIASES[word];
    if (alias) return alias;
  }
  return "crate";
}

function partCode(part: RecipePart, index: number, name: string): string {
  const options = [`name: "${name}-${index}"`];
  if (part.size !== undefined) options.push(`size: ${Array.isArray(part.size) ? `[${(part.size as readonly number[]).join(", ")}]` : String(part.size)}`);
  if (part.params) options.push(`params: { ${Object.entries(part.params).map(([key, value]) => `${key}: ${value}`).join(", ")} }`);
  const pbr = [`color: "${part.color}"`];
  if (part.roughness !== undefined) pbr.push(`roughness: ${part.roughness}`);
  if (part.metallic !== undefined) pbr.push(`metallic: ${part.metallic}`);
  options.push(`material: material.pbr({ ${pbr.join(", ")} })`);
  return `  primitives.${part.shape}({ ${options.join(", ")} }).position(${part.at.join(", ")}),`;
}

export function proceduralRecipe(need: string, name: string): { readonly recipe: string; readonly snippet: string } {
  const recipe = pickRecipe(need);
  const parts = PROCEDURAL_RECIPES[recipe]!;
  const lines = [
    `import { group, material, primitives } from "@aura3d/engine";`,
    ``,
    `// ${need}: built from primitives (${recipe} recipe), metres, standing on y = 0. Tune sizes and colours.`,
    `export const ${name} = group("${name}", [`,
    ...parts.map((part, index) => partCode(part, index, name)),
    `]);`,
  ];
  return { recipe, snippet: lines.join("\n") };
}

export function printLadderReport(report: LadderReport, print: (line: string) => void = console.log): void {
  print(`Need: "${report.need}" (role ${report.role}${report.headNoun ? `, matching "${report.headNoun}"` : ""})`);
  print(`Chosen: ${report.chosen}: ${report.reason}`);
  for (const skip of report.skipped) print(`  skipped ${skip.rung}: ${skip.reason}`);
  print(`Cost: ${report.costCredits} credits${report.dryRun ? " (dry run)" : ""}`);
  for (const message of report.messages) print(message);
  if (report.procedural) print(`\n${report.procedural.snippet}`);
  for (const warning of report.warnings) print(`warning: ${warning}`);
}
