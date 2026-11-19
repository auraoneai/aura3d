/**
 * Idol (fal.ai speridlabs/idol/max) image-to-3D pipeline behind `aura3d assets generate --provider idol`.
 * Ported from tools/idol/generate.mjs (which is now a thin wrapper over this module).
 *
 * Per item: reference still (openai/gpt-image-2.6, or a supplied --image) → Idol /max (PBR, optional rig + clips)
 * → skin refit for rigs → role-budget optimise (never simplifies skinned meshes) → scale/ground/face +Z
 * (skinned files keep scale 1) → slim PNG normals → four-side CPU base-colour preview → <outDir>/<key>.glb +
 * <key>.idol.json provenance → in-process admission (`assets add` path) as `candidate` with the fal licence.
 * Raw downloads, pending/done request files and the spend ledger live under the work dir (default .aura3d/fal/).
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { addAssetAsync } from "../../index.js";
import type { AuraCliAssetRole } from "../../asset-core-types.js";
import { checkProjectSkins, formatProjectSkinReport, runRepairSkin } from "../../skin/command.js";
import { optimizeGlbFile, type OptimizeRole } from "../assets/optimize.js";
import { loadGltfToolkit, type GltfToolkit, type Loose } from "../assets/gltfToolkit.js";
import { falDownload, falQueueRun, type FalTransportOptions } from "./falClient.js";
import { resolveGenerateDeps, type GenerateDeps, type NormalizeGlbResult, type NormalizeSize } from "./deps.js";
import { withAdmissionLock } from "./lock.js";
import { runItems, type RunSpecOptions } from "./runItems.js";

export const IDOL_IMAGE_MODEL = "openai/gpt-image-2.6/sunburst/text-to-image";
export const IDOL_MODEL = "speridlabs/idol/max";
/** USD estimates for the ledger and --dry-run (fal list prices, 2026-11). */
export const IDOL_PRICE = { image: 0.17, idol: 0.2, idolRig: 0.25 } as const;
export const IDOL_LICENSE = {
  license: "LicenseRef-fal-idol-generated",
  licenseName: "fal.ai generated output (speridlabs/idol/max)",
  licenseUrl: "https://fal.ai/models/speridlabs/idol/max",
  sourcePage: "https://fal.ai/models/speridlabs/idol/max",
  sourceFamily: "idol"
} as const;
export const IDOL_TERMS = "fal.ai model output; speridlabs/idol/max lists commercial use as supported. Generated for this project; no third-party likeness, brand or logo requested.";

const STYLES: Readonly<Record<string, string>> = {
  realistic: "Photoreal studio render, physically based materials, real-world surface detail and wear, high detail"
};
const NO_MARKS = "No text, no logos, no lettering, no numbers, no brand marks, no emblems anywhere on the object.";
const FRAMING = {
  object: "Single isolated object, the entire object in frame with margin, centered, three-quarter front view from slightly above, even soft studio lighting, no cast shadow, plain light-grey seamless background.",
  character: "Single full-body figure, head to feet in frame with margin, centered, standing in a T-pose: arms straight out horizontally to the sides, legs straight and apart at shoulder width, feet flat pointing forward, front view facing the camera, even soft studio lighting, no cast shadow, plain light-grey seamless background. Plain clothing back.",
  creature: "Single full-body creature, entire body in frame with margin, centered, standing still in a neutral pose on all its legs, legs straight and clearly separated, three-quarter side view, even soft studio lighting, no cast shadow, plain light-grey seamless background."
} as const;

/** [maxVerts, tex] per role. */
export const IDOL_ROLE_BUDGET: Readonly<Record<string, readonly [number, number]>> = {
  prop: [6000, 1024], background: [15000, 1024], "set-dressing": [15000, 1024], character: [30000, 2048], hero: [40000, 2048],
  vehicle: [40000, 2048], world: [40000, 2048], environment: [40000, 2048], weapon: [6000, 1024], enemy: [30000, 2048], product: [40000, 2048]
};
/** `assets optimize` only knows hero|vehicle|character|prop|background. */
export const IDOL_OPTIMIZE_ROLE: Readonly<Record<string, OptimizeRole>> = {
  prop: "prop", background: "background", "set-dressing": "background", character: "character", hero: "hero", vehicle: "vehicle",
  world: "hero", environment: "hero", weapon: "prop", enemy: "character", product: "hero"
};
export const IDOL_ROLES = Object.keys(IDOL_OPTIMIZE_ROLE);
/** `assets add` has no "background" role. */
export const idolAdmitRole = (role: string): string => (role === "background" ? "set-dressing" : role);

export type IdolKind = "object" | "character" | "creature" | "vehicle";
export const IDOL_KINDS: readonly IdolKind[] = ["object", "character", "creature", "vehicle"];

export interface IdolItem {
  readonly key: string;
  readonly subject?: string;
  /** Full image prompt (skips the style/framing template). */
  readonly prompt?: string;
  readonly kind?: IdolKind;
  readonly rig?: boolean;
  readonly animations?: readonly string[];
  readonly role?: string;
  readonly size?: NormalizeSize;
  readonly front?: string;
  readonly yawDeg?: number;
  readonly maxVerts?: number;
  readonly tex?: number;
  readonly noSimplify?: boolean;
  /** Local reference image (relative to the project); skips the paid image step. */
  readonly image?: string;
  readonly imageUrl?: string;
  readonly imageQuality?: string;
  readonly imageSize?: string;
  readonly imageType?: string;
  readonly pbr?: boolean;
  readonly seed?: number;
  readonly meshResolution?: number;
  readonly style?: string;
  readonly outDir?: string;
}

export interface IdolSpec {
  readonly game: string;
  readonly outDir?: string;
  readonly style?: string;
  readonly imageQuality?: string;
  readonly items: readonly IdolItem[];
}

export interface IdolRunContext {
  readonly projectDir: string;
  /** Raw downloads + pending files go to <workRoot>/<game>/<key>/. */
  readonly workRoot: string;
  readonly ledgerFile: string;
  readonly defaultOutDir?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly renormalize?: boolean;
  /** Admit through the `assets add` path (default true). */
  readonly admit?: boolean;
  readonly generator?: string;
  readonly fal?: FalTransportOptions;
  readonly deps?: Partial<GenerateDeps>;
  /** Directory for the admission lock (default <workRoot>). */
  readonly lockDir?: string;
}

export interface IdolItemResult {
  readonly key: string;
  readonly skipped?: boolean;
  readonly dryRun?: boolean;
  readonly renormalized?: boolean;
  readonly prompt?: string;
  readonly rig?: boolean;
  readonly role?: string;
  readonly finalGlb?: string;
  readonly provenance?: string;
  readonly preview?: string | null;
  readonly sizeMB?: number;
  readonly skin?: "pass" | "FAIL";
  readonly dims?: readonly number[];
  readonly usd?: number;
  readonly estUsd?: number;
  readonly admitted?: { readonly ok: boolean; readonly id: string; readonly quality: string; readonly messages: readonly string[] };
  readonly error?: string;
}

interface IdolResultJson {
  readonly game_glb?: { readonly url: string };
  readonly rigged_character_glb?: { readonly url: string };
  readonly rig?: { readonly animations?: readonly string[] } & Record<string, unknown>;
  readonly mesh_stats?: unknown;
}

export function idolKind(item: IdolItem): IdolKind {
  return item.kind ?? (item.rig ? "character" : "object");
}

export function idolRole(item: IdolItem): string {
  const kind = idolKind(item);
  return item.role ?? (item.rig ? "character" : kind === "vehicle" ? "vehicle" : "prop");
}

export function buildIdolPrompt(item: IdolItem, spec: Pick<IdolSpec, "style"> = {}): string {
  if (item.prompt) return item.prompt;
  const kind = idolKind(item);
  const styleName = item.style ?? spec.style ?? "realistic";
  const style = STYLES[styleName] ?? styleName;
  const framing = FRAMING[kind === "creature" ? "creature" : kind === "character" ? "character" : "object"];
  return `${item.subject}. ${style}. ${framing} ${NO_MARKS}`;
}

export function estimateIdolUsd(item: IdolItem): number {
  return round2((item.image || item.imageUrl ? 0 : IDOL_PRICE.image) + (item.rig ? IDOL_PRICE.idolRig : IDOL_PRICE.idol));
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const rel = (projectDir: string, path: string): string => relative(projectDir, path).split("\\").join("/");

interface ItemPaths {
  readonly work: string;
  readonly outDir: string;
  readonly finalGlb: string;
  readonly provFile: string;
}

function itemPaths(item: IdolItem, spec: IdolSpec, ctx: IdolRunContext): ItemPaths {
  const work = join(resolve(ctx.projectDir, ctx.workRoot), spec.game, item.key);
  const outDir = resolve(ctx.projectDir, item.outDir ?? spec.outDir ?? ctx.defaultOutDir ?? "assets/idol");
  return { work, outDir, finalGlb: join(outDir, `${item.key}.glb`), provFile: join(outDir, `${item.key}.idol.json`) };
}

/** Run one item (generate, or --renormalize from the raw downloads). Throws on failure. */
export async function runIdolItem(item: IdolItem, spec: IdolSpec, ctx: IdolRunContext): Promise<IdolItemResult> {
  if (!/^[A-Za-z_$][\w$]*$/.test(item.key)) throw new Error(`"${item.key}" is not a valid asset key: use a JS identifier such as heroRobot (it becomes assets.${item.key}).`);
  const paths = itemPaths(item, spec, ctx);
  const rig = Boolean(item.rig);
  const role = idolRole(item);
  if (!IDOL_OPTIMIZE_ROLE[role]) throw new Error(`${item.key}: unknown role "${role}". Use ${IDOL_ROLES.join(", ")}.`);
  const force = ctx.force || ctx.renormalize;
  if (existsSync(paths.finalGlb) && !force) return { key: item.key, skipped: true, finalGlb: rel(ctx.projectDir, paths.finalGlb) };
  if (ctx.renormalize) return renormalizeIdolItem(item, spec, ctx, paths);
  const prompt = buildIdolPrompt(item, spec);
  if (ctx.dryRun) return { key: item.key, dryRun: true, prompt, rig, role, estUsd: estimateIdolUsd(item) };
  if (!item.subject && !item.prompt && !item.image && !item.imageUrl) throw new Error(`${item.key}: needs a prompt (subject) or an --image reference.`);

  const deps = resolveGenerateDeps(ctx.deps);
  const { work, outDir, finalGlb, provFile } = paths;
  mkdirSync(work, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  if (ctx.force) for (const name of ["done-image.json", "done-idol.json", "idol-result.json", "game.glb", "rigged.glb", "refit.glb", "opt.glb", "views.png"]) rmSync(join(work, name), { force: true });
  const ledgerBase = { game: spec.game, key: item.key };
  const fal = ctx.fal ?? {};
  const steps: Record<string, unknown>[] = [];

  // 1. Reference still.
  let imageUrl = item.imageUrl;
  let imageUsd = 0;
  const refPng = join(work, "ref.png");
  if (!imageUrl && item.image) {
    const source = resolve(ctx.projectDir, item.image);
    if (!existsSync(source)) throw new Error(`${item.key}: --image ${item.image} does not exist.`);
    imageUrl = `data:${source.toLowerCase().endsWith(".jpg") || source.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : source.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png"};base64,${readFileSync(source).toString("base64")}`;
    if (source !== refPng) copyFileSync(source, refPng);
    steps.push({ step: "reference", source: rel(ctx.projectDir, source) });
  }
  if (!imageUrl) {
    const input = { prompt, quality: item.imageQuality ?? spec.imageQuality ?? "high", num_images: 1, output_format: "png", image_size: item.imageSize ?? "square_hd" };
    const run = await falQueueRun<{ images: { url: string }[] }>(IDOL_IMAGE_MODEL, input, {
      ...fal, label: `${item.key} image`, pendingFile: join(work, "pending-image.json"), ledger: { file: ctx.ledgerFile, entry: { ...ledgerBase, usd: IDOL_PRICE.image } }
    });
    if (!existsSync(refPng) || run.from !== "done") await falDownload(run.result.images[0]!.url, refPng, fal);
    // Hand Idol the local still: fal media URLs expire, and a resumed run must not depend on them.
    imageUrl = `data:image/png;base64,${readFileSync(refPng).toString("base64")}`;
    imageUsd = IDOL_PRICE.image;
    steps.push({ step: "reference", model: IDOL_IMAGE_MODEL, requestId: run.requestId, prompt, usd: IDOL_PRICE.image, ...(run.resumed ? { resumed: true } : {}) });
  }

  // 2. Idol.
  const idolInput = {
    image_url: imageUrl, enable_pbr: item.pbr ?? true, image_type: item.imageType ?? "synthetic", seed: item.seed ?? 7,
    mesh_resolution: item.meshResolution ?? 1024, ...(rig ? { rig: true, animations: item.animations ?? ["idle", "walk", "run", "jump"] } : {})
  };
  const idolUsd = rig ? IDOL_PRICE.idolRig : IDOL_PRICE.idol;
  const idolRun = await falQueueRun<IdolResultJson>(IDOL_MODEL, idolInput, {
    ...fal, label: `${item.key} idol`, pendingFile: join(work, "pending-idol.json"), ledger: { file: ctx.ledgerFile, entry: { ...ledgerBase, usd: idolUsd, rig } }
  });
  const idol = idolRun.result;
  writeFileSync(join(work, "idol-result.json"), JSON.stringify(idol, null, 1));
  steps.push({
    step: "idol", model: IDOL_MODEL, requestId: idolRun.requestId,
    input: { ...idolInput, image_url: item.image ? "(local image)" : "(reference still)" }, usd: idolUsd, meshStats: idol.mesh_stats, rig: idol.rig ?? null,
    ...(idolRun.resumed ? { resumed: true } : {})
  });
  if (!idol.game_glb?.url) throw new Error(`${item.key}: Idol returned no game_glb (see ${rel(ctx.projectDir, join(work, "idol-result.json"))}).`);
  const rawGlb = join(work, "game.glb");
  if (!existsSync(rawGlb) || idolRun.from !== "done") await falDownload(idol.game_glb.url, rawGlb, fal);
  let source = rawGlb;
  let skin: Record<string, unknown> | null = null;
  if (rig) {
    if (!idol.rigged_character_glb?.url) throw new Error(`${item.key}: Idol could not rig this object (rig=${JSON.stringify(idol.rig)}); retry without --rig or with a clearer T-pose reference.`);
    const rigged = join(work, "rigged.glb");
    if (!existsSync(rigged) || idolRun.from !== "done") await falDownload(idol.rigged_character_glb.url, rigged, fal);
    const refit = refitRig(ctx.projectDir, rigged, join(work, "refit.glb"), idol.rig?.animations ?? []);
    source = refit.source;
    skin = refit.skin;
  }

  const post = await postProcess(item, ctx, deps, { source, work, finalGlb, rig, role });
  const provenance = {
    schema: "aura3d.idol-provenance/1", game: spec.game, key: item.key, generatedAt: new Date().toISOString(), generator: ctx.generator ?? "aura3d assets generate",
    terms: IDOL_TERMS, steps, prompt, role, admitRole: idolAdmitRole(role), rig, skin,
    settings: settingsOf(item), normalized: post.normalized, finalGlb: rel(ctx.projectDir, finalGlb), sizeBytes: statSync(finalGlb).size,
    preview: post.preview ? rel(ctx.projectDir, post.preview) : null, work: rel(ctx.projectDir, work), ledger: rel(ctx.projectDir, ctx.ledgerFile),
    usd: round2(imageUsd + idolUsd)
  };
  writeFileSync(provFile, `${JSON.stringify(provenance, null, 2)}\n`);
  const admitted = ctx.admit === false ? undefined : await admitIdolAsset(ctx, { key: item.key, role, finalGlb, provFile, prompt, requestId: idolRun.requestId, settings: settingsOf(item) });
  return {
    key: item.key, finalGlb: rel(ctx.projectDir, finalGlb), provenance: rel(ctx.projectDir, provFile), preview: provenance.preview,
    sizeMB: round2(provenance.sizeBytes / 1e6), ...(skin ? { skin: skin.pass ? "pass" as const : "FAIL" as const } : {}), dims: post.normalized.size, usd: provenance.usd,
    ...(admitted ? { admitted } : {})
  };
}

function settingsOf(item: IdolItem): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  for (const name of ["kind", "rig", "animations", "role", "size", "front", "yawDeg", "maxVerts", "tex", "noSimplify", "seed", "style", "imageType", "meshResolution", "pbr"] as const) {
    if (item[name] !== undefined) settings[name] = item[name];
  }
  return settings;
}

/** Skin refit for Idol rigs (in-process `assets repair-skin --refit-skeleton --smooth-bridges --keep-clips`), then validate. */
function refitRig(projectDir: string, rigged: string, refitOut: string, clips: readonly string[]): { source: string; skin: Record<string, unknown> } {
  rmSync(refitOut, { force: true });
  let repairLog: string;
  try {
    const repaired = runRepairSkin(projectDir, rigged, { out: refitOut, refitSkeleton: true, smoothBridges: true, ...(clips.length ? { keepClips: [...clips] } : {}) });
    repairLog = repaired.messages.slice(-4).join("\n");
  } catch (error) {
    repairLog = `repair-skin failed: ${(error as Error).message}`;
  }
  const source = existsSync(refitOut) ? refitOut : rigged;
  let pass = false;
  let report = "";
  try {
    const checked = checkProjectSkins(projectDir, { file: source });
    pass = checked.ok;
    report = formatProjectSkinReport(checked).split("\n").slice(0, 6).join("\n");
  } catch (error) {
    report = `skin check failed: ${(error as Error).message}`;
  }
  return { source, skin: { pass, repaired: source === refitOut, report, repairLog } };
}

/** glTF-Transform's default logger prints transform progress to stdout, which would corrupt --json output. */
const QUIET_LOGGER = {
  debug(): void {},
  info(): void {},
  warn(text: string): void { process.stderr.write(`glTF-Transform: ${text}\n`); },
  error(text: string): void { process.stderr.write(`glTF-Transform: ${text}\n`); }
};

function quietToolkit(projectDir: string): GltfToolkit {
  const toolkit = loadGltfToolkit(projectDir);
  const Base = toolkit.NodeIO as new (...args: Loose[]) => Loose;
  class QuietNodeIO extends Base {
    constructor(...args: Loose[]) {
      super(...args);
      this.setLogger(QUIET_LOGGER);
    }
  }
  return { ...toolkit, NodeIO: QuietNodeIO };
}

async function postProcess(
  item: IdolItem,
  ctx: IdolRunContext,
  deps: GenerateDeps,
  opts: { source: string; work: string; finalGlb: string; rig: boolean; role: string }
): Promise<{ normalized: NormalizeGlbResult; preview: string | null }> {
  const [maxVerts, tex] = IDOL_ROLE_BUDGET[opts.role] ?? IDOL_ROLE_BUDGET.prop!;
  const optimized = join(opts.work, "opt.glb");
  rmSync(optimized, { force: true });
  try {
    await optimizeGlbFile({
      input: opts.source, output: optimized, projectDir: ctx.projectDir, toolkit: quietToolkit(ctx.projectDir), role: IDOL_OPTIMIZE_ROLE[opts.role] ?? "prop",
      maxVerts: item.maxVerts ?? maxVerts, tex: item.tex ?? tex, simplify: !(opts.rig || item.noSimplify)
    });
  } catch (error) {
    throw new Error(`${item.key}: optimise failed: ${(error as Error).message}`);
  }
  // Skinned files keep scale 1: the skin check measures posed edges with the wrapper scale but rest edges without it,
  // so a scaled wrapper inflates SKIN_STRETCH by the scale factor. Apply `sceneScale` (in provenance) on the scene node.
  mkdirSync(dirname(opts.finalGlb), { recursive: true });
  const normalized = await deps.normalizeGlb(optimized, opts.finalGlb, {
    front: item.front ?? "+x", ...(item.size ? { size: item.size } : {}), yawDeg: item.yawDeg ?? 0, keepScale: opts.rig, provenance: { generator: "idol", key: item.key },
    projectDir: ctx.projectDir
  });
  await deps.slimGlb(opts.finalGlb, { projectDir: ctx.projectDir });
  const views = join(opts.work, "views.png");
  let preview: string | null = null;
  try {
    await deps.renderPreview(opts.finalGlb, views, { projectDir: ctx.projectDir });
    preview = existsSync(views) ? views : null;
  } catch {
    // The CPU preview is advisory.
  }
  return { normalized, preview };
}

/** Re-run optimise + normalise + slim + preview from the raw downloads (no fal calls, $0). */
async function renormalizeIdolItem(item: IdolItem, spec: IdolSpec, ctx: IdolRunContext, paths: ItemPaths): Promise<IdolItemResult> {
  const { work, finalGlb, provFile } = paths;
  const rig = Boolean(item.rig);
  const role = idolRole(item);
  const source = [join(work, "refit.glb"), join(work, "rigged.glb"), join(work, "game.glb")].find((file) => existsSync(file) && (rig || file.endsWith("game.glb")));
  if (!source) throw new Error(`${item.key}: no raw download in ${rel(ctx.projectDir, work)} to renormalise (generate it first, or pass the same --work).`);
  if (ctx.dryRun) return { key: item.key, dryRun: true, renormalized: true, rig, role, estUsd: 0 };
  const deps = resolveGenerateDeps(ctx.deps);
  const post = await postProcess(item, ctx, deps, { source, work, finalGlb, rig, role });
  const previous = existsSync(provFile) ? (JSON.parse(readFileSync(provFile, "utf8")) as Record<string, unknown>) : { schema: "aura3d.idol-provenance/1", game: spec.game, key: item.key };
  const provenance = {
    ...previous, role, admitRole: idolAdmitRole(role), settings: { ...((previous.settings as Record<string, unknown>) ?? {}), ...settingsOf(item) },
    normalized: post.normalized, renormalizedAt: new Date().toISOString(), sizeBytes: statSync(finalGlb).size, finalGlb: rel(ctx.projectDir, finalGlb),
    ...(post.preview ? { preview: rel(ctx.projectDir, post.preview) } : {})
  };
  writeFileSync(provFile, `${JSON.stringify(provenance, null, 2)}\n`);
  const steps = (previous.steps as { step?: string; requestId?: string }[] | undefined) ?? [];
  const admitted = ctx.admit === false ? undefined : await admitIdolAsset(ctx, {
    key: item.key, role, finalGlb, provFile, prompt: typeof previous.prompt === "string" ? previous.prompt : buildIdolPrompt(item, spec),
    requestId: steps.find((step) => step.step === "idol")?.requestId, settings: provenance.settings
  });
  return {
    key: item.key, renormalized: true, finalGlb: rel(ctx.projectDir, finalGlb), provenance: rel(ctx.projectDir, provFile),
    sizeMB: round2(provenance.sizeBytes / 1e6), dims: post.normalized.size, usd: 0, ...(admitted ? { admitted } : {})
  };
}

/** Admit through the `assets add` path, serialised by a project lock so parallel runs never interleave manifest writes. */
export async function admitIdolAsset(
  ctx: Pick<IdolRunContext, "projectDir" | "workRoot" | "lockDir">,
  asset: { key: string; role: string; finalGlb: string; provFile: string; prompt: string; requestId?: string; settings?: Record<string, unknown> }
): Promise<{ ok: boolean; id: string; quality: string; messages: readonly string[] }> {
  const provRel = rel(ctx.projectDir, asset.provFile);
  const lockDir = resolve(ctx.projectDir, ctx.lockDir ?? ctx.workRoot);
  const now = new Date().toISOString();
  try {
    const result = await withAdmissionLock(lockDir, () => addAssetAsync({
      projectDir: ctx.projectDir,
      file: rel(ctx.projectDir, asset.finalGlb),
      name: asset.key,
      type: "model",
      role: idolAdmitRole(asset.role) as AuraCliAssetRole,
      quality: "candidate",
      ...IDOL_LICENSE,
      licenseRaw: `Generated through the authenticated fal.ai API with speridlabs/idol/max (commercial use listed as supported); prompts name no brand, logo or real person. Provenance: ${provRel}.`,
      author: "Generated with speridlabs/idol/max on fal.ai",
      retrievedAt: now,
      provenanceEvidence: [provRel],
      generation: {
        provider: "fal",
        providerCli: "aura3d assets generate --provider idol",
        ...(asset.requestId ? { taskId: asset.requestId } : {}),
        operation: "image-to-3d",
        promptHash: `sha256-${createHash("sha256").update(asset.prompt).digest("hex")}`,
        model: IDOL_MODEL,
        ...(asset.settings ? { settings: asset.settings } : {}),
        createdAt: now,
        localMetadata: provRel,
        rightsEvidence: provRel
      }
    }));
    return { ok: result.ok, id: asset.key, quality: "candidate", messages: result.messages };
  } catch (error) {
    return { ok: false, id: asset.key, quality: "candidate", messages: [`admission failed: ${(error as Error).message}. The GLB is kept; fix the cause and rerun with --renormalize (no fal cost) or admit it with \`aura3d assets add\`.`] };
  }
}

export async function runIdolSpec(spec: IdolSpec, ctx: IdolRunContext, options: RunSpecOptions<IdolItem, IdolItemResult> = {}): Promise<IdolItemResult[]> {
  if (!spec || typeof spec.game !== "string" || !Array.isArray(spec.items)) throw new Error("Idol spec needs { \"game\": \"<slug>\", \"items\": [ { \"key\", \"subject\" | \"image\", ... } ] }.");
  const unknown = (options.only ?? []).filter((key) => !spec.items.some((item) => item.key === key));
  if (unknown.length) throw new Error(`--only: ${unknown.join(", ")} not in the spec (keys: ${spec.items.map((item) => item.key).join(", ")}).`);
  return runItems(spec.items, (item) => runIdolItem(item, spec, ctx), options) as Promise<IdolItemResult[]>;
}
