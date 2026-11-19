/**
 * Text-to-motion pipeline behind `aura3d animation generate` (fal.ai fal-ai/hunyuan-motion, $0.08 per clip).
 * Ported from tools/idol/motion.mjs (now a thin wrapper over this module).
 *
 * Per clip: fal request (resume-safe pending file, ledgered at submit time) → motion.json (HY-Motion dict: SMPL 22-joint
 * local rot6d, transl, keypoints3d, 30 fps) [+ motion.fbx with --fbx, a second $0.08 request] under
 * <work>/motion/<game>/<key>/ with provenance.json. `animation generate` then retargets the clips onto a rig with
 * `importClipsOntoRig` (the `animation import` engine).
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { falDownload, falQueueRun, type FalTransportOptions } from "./falClient.js";
import { runItems, type RunSpecOptions } from "./runItems.js";

export const MOTION_MODEL = "fal-ai/hunyuan-motion";
export const MOTION_PRICE = 0.08;
export const MOTION_TERMS = "fal.ai model output generated for this project from a text prompt; no third-party likeness, brand or motion source named.";

export interface MotionClipSpec {
  readonly key: string;
  readonly prompt: string;
  /** Seconds, 0.5-12 (fal limit). Default 2. */
  readonly duration?: number;
  readonly loop?: boolean;
  readonly seed?: number;
  /** guidance_scale 1-10, default 5. */
  readonly guidance?: number;
  /** Trim [a, b] seconds before retargeting. */
  readonly window?: readonly [number, number];
  /** false keeps a clip's own turn (spins, pivots). */
  readonly faceForward?: boolean;
}

export interface MotionSpec {
  readonly game: string;
  /** TypeScript module path (tools/idol/motion.mjs only). */
  readonly out?: string;
  /** Rigged GLB the clips are retargeted onto (`animation generate --spec` fallback for --onto). */
  readonly onto?: string;
  /** Output GLB (`animation generate --spec` fallback for --out). */
  readonly outGlb?: string;
  readonly clips: readonly MotionClipSpec[];
}

export interface MotionRunContext {
  readonly projectDir: string;
  /** Clips go to <workRoot>/motion/<game>/<key>/. */
  readonly workRoot: string;
  readonly ledgerFile: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly fbx?: boolean;
  readonly generator?: string;
  readonly fal?: FalTransportOptions;
}

export interface MotionClipResult {
  readonly key: string;
  readonly dryRun?: boolean;
  readonly estUsd?: number;
  readonly usd?: number;
  readonly cached?: boolean;
  readonly dict?: string;
  readonly fbx?: string;
  readonly requestId?: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

const rel = (projectDir: string, path: string): string => relative(projectDir, path).split("\\").join("/");

export function motionWorkDir(ctx: Pick<MotionRunContext, "projectDir" | "workRoot">, game: string, key: string): string {
  return join(resolve(ctx.projectDir, ctx.workRoot), "motion", game, key);
}

export function motionDictPath(ctx: Pick<MotionRunContext, "projectDir" | "workRoot">, game: string, key: string): string {
  return join(motionWorkDir(ctx, game, key), "motion.json");
}

export function motionInput(clip: MotionClipSpec): { prompt: string; duration: number; guidance_scale: number; seed: number } {
  return { prompt: clip.prompt, duration: clip.duration ?? 2, guidance_scale: clip.guidance ?? 5, seed: clip.seed ?? 7 };
}

export function validateMotionClip(clip: MotionClipSpec): void {
  if (!clip || typeof clip.key !== "string" || !/^[A-Za-z_$][\w$-]*$/.test(clip.key)) throw new Error(`clip name "${clip?.key}" must be an identifier such as Run or Idle.`);
  if (typeof clip.prompt !== "string" || clip.prompt.trim().length < 3) throw new Error(`${clip.key}: needs a prompt describing what the body does.`);
  const input = motionInput(clip);
  if (!(input.duration >= 0.5 && input.duration <= 12)) throw new Error(`${clip.key}: --duration must be 0.5-12 s (fal limit), got ${input.duration}.`);
  if (!(input.guidance_scale >= 1 && input.guidance_scale <= 10)) throw new Error(`${clip.key}: --guidance must be 1-10, got ${input.guidance_scale}.`);
  if (!Number.isInteger(input.seed)) throw new Error(`${clip.key}: --seed must be an integer, got ${input.seed}.`);
  if (clip.window && !(clip.window.length === 2 && clip.window[0] >= 0 && clip.window[1] > clip.window[0])) throw new Error(`${clip.key}: --window must be a,b seconds with a < b.`);
}

export function estimateMotionUsd(ctx: Pick<MotionRunContext, "projectDir" | "workRoot" | "force" | "fbx">, game: string, clip: MotionClipSpec): number {
  const work = motionWorkDir(ctx, game, clip.key);
  const dict = !ctx.force && existsSync(join(work, "motion.json")) ? 0 : MOTION_PRICE;
  const fbx = ctx.fbx && (ctx.force || !existsSync(join(work, "motion.fbx"))) ? MOTION_PRICE : 0;
  return Math.round((dict + fbx) * 100) / 100;
}

/** Generate one clip's motion.json (and motion.fbx with ctx.fbx). Existing outputs are reused unless ctx.force. */
export async function generateMotionClip(clip: MotionClipSpec, game: string, ctx: MotionRunContext): Promise<MotionClipResult> {
  validateMotionClip(clip);
  const work = motionWorkDir(ctx, game, clip.key);
  const dictFile = join(work, "motion.json");
  const fbxFile = join(work, "motion.fbx");
  const input = motionInput(clip);
  if (ctx.dryRun) return { key: clip.key, dryRun: true, estUsd: estimateMotionUsd(ctx, game, clip), input };
  mkdirSync(work, { recursive: true });
  if (ctx.force) for (const name of ["motion.json", "motion.fbx", "done-dict.json", "done-fbx.json"]) rmSync(join(work, name), { force: true });
  const fal = ctx.fal ?? {};
  let requestId: string | undefined;
  let usd = 0;
  if (!existsSync(dictFile)) {
    const run = await falQueueRun<{ motion_json?: { url: string } }>(MOTION_MODEL, { ...input, output_format: "dict" }, {
      ...fal, label: `${clip.key} motion`, pendingFile: join(work, "pending-dict.json"),
      ledger: { file: ctx.ledgerFile, entry: { game, key: clip.key, usd: MOTION_PRICE } }
    });
    if (!run.result.motion_json?.url) throw new Error(`${clip.key}: fal returned no motion_json.`);
    await falDownload(run.result.motion_json.url, dictFile, fal);
    requestId = run.requestId;
    if (!run.resumed) usd += MOTION_PRICE;
  }
  if (ctx.fbx && !existsSync(fbxFile)) {
    const run = await falQueueRun<{ fbx_file?: { url: string } }>(MOTION_MODEL, { ...input, output_format: "fbx" }, {
      ...fal, label: `${clip.key} motion fbx`, pendingFile: join(work, "pending-fbx.json"),
      ledger: { file: ctx.ledgerFile, entry: { game, key: `${clip.key}:fbx`, usd: MOTION_PRICE } }
    });
    if (run.result.fbx_file?.url) await falDownload(run.result.fbx_file.url, fbxFile, fal);
    if (!run.resumed) usd += MOTION_PRICE;
  }
  const provFile = join(work, "provenance.json");
  if (requestId || !existsSync(provFile)) {
    writeFileSync(provFile, `${JSON.stringify({
      schema: "aura3d.idol-motion-provenance/1", game, key: clip.key, model: MOTION_MODEL, input, ...(requestId ? { requestId } : {}),
      generator: ctx.generator ?? "aura3d animation generate", terms: MOTION_TERMS, ledger: rel(ctx.projectDir, ctx.ledgerFile), generatedAt: new Date().toISOString()
    }, null, 2)}\n`);
  }
  return {
    key: clip.key, dict: rel(ctx.projectDir, dictFile), ...(existsSync(fbxFile) ? { fbx: rel(ctx.projectDir, fbxFile) } : {}),
    ...(requestId ? { requestId } : { cached: true }), usd: Math.round(usd * 100) / 100
  };
}

export async function runMotionSpec(spec: MotionSpec, ctx: MotionRunContext, options: RunSpecOptions<MotionClipSpec, MotionClipResult> = {}): Promise<MotionClipResult[]> {
  if (!spec || typeof spec.game !== "string" || !Array.isArray(spec.clips)) throw new Error("Motion spec needs { \"game\": \"<slug>\", \"clips\": [ { \"key\", \"prompt\", \"duration\", ... } ] }.");
  const unknown = (options.only ?? []).filter((key) => !spec.clips.some((clip) => clip.key === key));
  if (unknown.length) throw new Error(`--only: ${unknown.join(", ")} not in the spec (clips: ${spec.clips.map((clip) => clip.key).join(", ")}).`);
  return runItems(spec.clips, (clip) => generateMotionClip(clip, spec.game, ctx), { concurrency: 8, ...options }) as Promise<MotionClipResult[]>;
}
