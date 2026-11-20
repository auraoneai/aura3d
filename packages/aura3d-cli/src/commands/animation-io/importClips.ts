/**
 * `importClipsOntoRig` — the engine behind `aura3d animation import`: read motion clips (.bvh, .fbx, .glb/.gltf clips,
 * HY-Motion motion.json), retarget them onto a rigged GLB's skeleton through the humanoid role mapping
 * (@aura3d/animation smpl module; Idol `bone_N` rigs included), and write real glTF animation channels into the output
 * GLB. Every clip is checked before anything is written (limb flips, retarget error, frozen T-pose output), the written
 * file is re-sampled through an independent FK path and compared with the source, and `assets validate --skin --clips`
 * runs on the result.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  bakeHumanoidFramesToGltf,
  detectHumanoidFacing,
  LIMB_SEGMENTS,
  limbAngleDeg,
  type HumanoidFacing,
  type HumanoidGltfBake,
  type HumanoidRole,
  type RootMotionMode
} from "@aura3d/animation";
import { readAssetManifest } from "../../asset-manifest.js";
import { readSkinAllowlist } from "../../skin/command.js";
import { analyzeSkin, type SkinReport } from "../../skin/analysis.js";
import { compactGlb, GlbEditor } from "../../skin/glbEdit.js";
import { buildHierarchy, forward, localPose, readGlbFile, restTrs, writeGlbFile, type GlbData, type GltfAnimation } from "../../skin/gltf.js";
import { readGltfSkeleton, readSourceClips, sourceFormatOf, type GltfSkeleton, type SourceClip, type SourceFormat } from "./sources.js";

export interface ImportClipSource {
  /** Output clip name. Default: the source clip name (file stem for single-clip formats). */
  readonly name?: string;
  /** Source file (.bvh, .fbx, .glb, .gltf, HY-Motion .json). */
  readonly file: string;
  /** One clip of a multi-clip source (GLB/FBX). */
  readonly clip?: string;
}

export type RoleMap = Partial<Record<HumanoidRole, string>>;

export interface ImportClipsOntoRigOptions {
  /** Rigged target GLB. */
  readonly onto: string;
  readonly output: string;
  readonly clips: readonly ImportClipSource[];
  /** Base for relative paths (default process.cwd()). */
  readonly projectDir?: string;
  /** Source clip names to take from multi-clip sources that do not name one. */
  readonly sourceClips?: readonly string[];
  /** "auto" (default), a JSON file path, or a parsed `{ target?, source? }` / flat target role map. */
  readonly map?: "auto" | string | { readonly target?: RoleMap; readonly source?: RoleMap };
  readonly rootMotion?: RootMotionMode;
  readonly window?: readonly [number, number];
  readonly loop?: boolean;
  /** Output keys per second (default 30). */
  readonly fps?: number;
  /** Remove each clip's mean heading (default true; false = keep the clip's own turn). */
  readonly faceForward?: boolean;
  readonly sourceFacing?: HumanoidFacing | "auto";
  readonly targetFacing?: HumanoidFacing | "auto";
  /** Keep the target's existing clips (same-named clips are replaced). Default drops them. */
  readonly keepBaseAnimations?: boolean;
  /** Run everything, write nothing (the skin check runs on a temporary copy). */
  readonly dryRun?: boolean;
  /** Largest allowed limb-direction error, degrees (default 2). */
  readonly maxLimbErrorDeg?: number;
  /** Single-key swing that counts as a limb flip (default 120 degrees). */
  readonly flipThresholdDeg?: number;
  /**
   * Fail on any skin error the allow-list does not cover (the plain `assets validate --skin` rule). Default: skin
   * defects the base rig already shows in its own clips are warnings unless the imported clips make them materially
   * worse (a new error code, or more than `skinTolerance` x the base rig's stretched/flap triangles).
   */
  readonly strict?: boolean;
  /** Allowed growth factor over the base rig's skin defects (default 1.5). */
  readonly skinTolerance?: number;
}

export interface ImportedClipReport {
  readonly name: string;
  readonly source: string;
  readonly sourceClip: string;
  readonly format: SourceFormat;
  readonly duration: number;
  readonly frames: number;
  readonly fps: number;
  readonly channels: number;
  readonly limbErrorDeg: { readonly max: number; readonly mean: number };
  /** Same error measured on the written file (independent FK through the whole node tree). */
  readonly verifiedErrorDeg: number;
  readonly motionDeg: number;
  readonly flips: number;
  readonly sourceFacing?: string;
  readonly sourceRoles?: Readonly<Record<string, string>>;
  readonly meta: Readonly<Record<string, number | string>>;
  readonly diagnostics: readonly string[];
}

export interface ImportClipsResult {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly output: string;
  readonly written: boolean;
  readonly bytes: number;
  readonly target: { readonly file: string; readonly facing: HumanoidFacing; readonly facingMethod: string; readonly roles: Readonly<Record<string, string>>; readonly hipHeight: number };
  readonly clips: readonly ImportedClipReport[];
  readonly animations: readonly string[];
  readonly skin?: SkinJudgement;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

/** A check failed before anything was written; `code` names the failure, the message names the fix. */
export class AnimationImportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AnimationImportError";
  }
}

const CLIP_NAME = /^[A-Za-z_][A-Za-z0-9_. -]*$/;
const STATIC_MOTION_DEG = 2;

function loadRoleMaps(map: ImportClipsOntoRigOptions["map"], projectDir: string): { target?: RoleMap; source?: RoleMap } {
  if (!map || map === "auto") return {};
  let parsed: unknown = map;
  if (typeof map === "string") {
    const file = resolve(projectDir, map);
    if (!existsSync(file)) throw new AnimationImportError("ANIMATION_IMPORT_MAP", `--map ${map}: file not found (use --map auto or a JSON file {"target":{"hips":"bone_0",...},"source":{...}}).`);
    try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch (error) {
      throw new AnimationImportError("ANIMATION_IMPORT_MAP", `--map ${map}: not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
  const obj = parsed as Record<string, unknown>;
  if (!obj || typeof obj !== "object") throw new AnimationImportError("ANIMATION_IMPORT_MAP", "--map must be a JSON object of role -> bone name.");
  const pick = (v: unknown): RoleMap | undefined => (v && typeof v === "object" ? (v as RoleMap) : undefined);
  if ("target" in obj || "source" in obj) {
    const target = pick(obj.target), source = pick(obj.source);
    return { ...(target ? { target } : {}), ...(source ? { source } : {}) };
  }
  return { target: obj as RoleMap };
}

function decomposeJointMatrices(json: GlbData["json"], nodes: readonly number[]): void {
  for (const n of nodes) {
    const node = json.nodes[n];
    if (!node?.matrix) continue;
    const trs = restTrs(node);
    delete node.matrix;
    node.translation = trs.t; node.rotation = trs.r; node.scale = trs.s;
  }
}

export interface SkinJudgement {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  /** Codes allow-listed in aura.skin-allow.json (output id, or the admitted asset the --onto file belongs to). */
  readonly allowed: readonly string[];
  readonly allowedBy: readonly string[];
  readonly mode: "strict" | "relative-to-base";
  /** Base rig's own clips vs the imported clips: stretched and flap triangles, error codes. */
  readonly base?: { readonly clips: readonly string[]; readonly stretched: number; readonly flaps: number; readonly codes: readonly string[] };
  readonly imported: { readonly stretched: number; readonly flaps: number; readonly codes: readonly string[] };
  readonly report: SkinReport;
}

const sumOver = (r: SkinReport, key: "trianglesOverLimit" | "flaps"): number => Object.values(r.materials).reduce((n, m) => n + m[key], 0);
const errorCodes = (r: SkinReport): string[] => [...new Set(r.findings.filter((f) => f.severity === "error").map((f) => f.code))];

/** Allow-list ids that cover this import: the output's id plus any admitted asset whose source/outputPath/id is the --onto file. */
function allowIdsFor(projectDir: string, onto: string, output: string): string[] {
  const ids = new Set<string>([basename(output, extname(output))]);
  try {
    for (const asset of readAssetManifest(projectDir).assets) {
      const paths = [asset.source, asset.outputPath, asset.derived?.outputPath].filter((p): p is string => typeof p === "string" && p.length > 0);
      if (paths.some((p) => resolve(projectDir, p) === onto) || asset.id === basename(onto, extname(onto))) ids.add(asset.id);
    }
  } catch {
    // unreadable manifest: only the output id applies
  }
  return [...ids];
}

/**
 * The skin check on the written clips. Strict: every error not allow-listed fails. Default: allow-listed codes and
 * defects the base rig already shows in its own clips are warnings; a new error code, or stretched/flap triangles
 * above `tolerance` x the base, fails (the imported motion made the rig materially worse).
 */
function judgeSkin(args: { projectDir: string; onto: string; output: string; file: string; target: GlbData; clips: readonly string[]; strict: boolean; tolerance: number }): SkinJudgement {
  const report = analyzeSkin(readGlbFile(args.file), { clips: args.clips });
  const allow = readSkinAllowlist(args.projectDir);
  const outputId = basename(args.output, extname(args.output));
  const allowedBy = args.strict ? (allow[outputId] ? [outputId] : []) : allowIdsFor(args.projectDir, args.onto, args.output).filter((id) => allow[id]);
  const allowed = [...new Set(allowedBy.flatMap((id) => allow[id]!.allow))];
  const imported = { stretched: sumOver(report, "trianglesOverLimit"), flaps: sumOver(report, "flaps"), codes: errorCodes(report) };
  const errors = report.findings.filter((f) => f.severity === "error");
  const warnings = report.findings.filter((f) => f.severity !== "error").map((f) => `${f.code}: ${f.message}`);
  const failures: string[] = [];
  let base: SkinJudgement["base"];
  if (args.strict) {
    for (const f of errors) (allowed.includes(f.code) ? warnings : failures).push(`${f.code}: ${f.message}${allowed.includes(f.code) ? " [allow-listed]" : ""}`);
  } else {
    const baseClips = (args.target.json.animations ?? []).map((a) => a.name ?? "").filter(Boolean);
    const baseReport = analyzeSkin(args.target, baseClips.length ? { clips: baseClips } : {});
    base = { clips: baseClips, stretched: sumOver(baseReport, "trianglesOverLimit"), flaps: sumOver(baseReport, "flaps"), codes: errorCodes(baseReport) };
    for (const f of errors) {
      const line = `${f.code}: ${f.message}`;
      if (allowed.includes(f.code)) { warnings.push(`${line} [allow-listed: ${allowedBy.join(", ")}]`); continue; }
      if (!base.codes.includes(f.code)) { failures.push(`${line} [new: the base rig's own clips (${baseClips.join(", ") || "rest pose"}) do not show it]`); continue; }
      const key = f.code === "SKIN_FLAP" ? "flaps" : f.code === "SKIN_STRETCH" ? "stretched" : undefined;
      if (key && imported[key] > args.tolerance * base[key]) {
        failures.push(`${line} [materially worse than the base rig: ${imported[key]} vs ${base[key]} triangles in its own clips, over ${args.tolerance}x]`);
      } else warnings.push(`${line} [pre-existing: the base rig shows it in ${baseClips.join(", ") || "its rest pose"}${key ? ` (${base[key]} triangles; imported ${imported[key]})` : ""}]`);
    }
  }
  return { ok: failures.length === 0, failures, warnings, allowed, allowedBy, mode: args.strict ? "strict" : "relative-to-base", ...(base ? { base } : {}), imported, report };
}

/** Append baked clips as glTF animations (one shared time accessor per clip). */
function writeAnimations(target: GlbData, bakes: readonly { readonly name: string; readonly bake: HumanoidGltfBake }[], nodes: readonly number[], keepBase: boolean): GlbData {
  const editor = new GlbEditor(target);
  const json = editor.json;
  const names = new Set(bakes.map((b) => b.name));
  json.animations = keepBase ? (json.animations ?? []).filter((a) => !names.has(a.name ?? "")) : [];
  decomposeJointMatrices(json, nodes);
  for (const { name, bake } of bakes) {
    const input = editor.addAccessor(bake.times, 5126, "SCALAR", undefined);
    json.accessors[input]!.min = [bake.times[0]!];
    json.accessors[input]!.max = [bake.times[bake.times.length - 1]!];
    const anim: GltfAnimation = { name, samplers: [], channels: [] };
    for (const ch of bake.channels) {
      const output = editor.addAccessor(ch.values, 5126, ch.path === "rotation" ? "VEC4" : "VEC3", undefined);
      anim.samplers.push({ input, output, interpolation: "LINEAR" });
      anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: nodes[ch.boneIndex]!, path: ch.path } });
    }
    json.animations.push(anim);
  }
  const used = new Set([...((json.extensionsUsed as string[] | undefined) ?? []), ...((json.extensionsRequired as string[] | undefined) ?? [])]);
  // Repack (drops the dropped clips' bytes) unless compressed buffer views would not survive an accessor-level repack.
  if (!used.has("KHR_draco_mesh_compression") && !used.has("EXT_meshopt_compression")) return compactGlb({ json, bin: editor.bin });
  json.buffers[0] = { ...(json.buffers[0] ?? {}), byteLength: editor.bin.length };
  return { json, bin: editor.bin };
}

/** Re-sample the written clips through the generic FK path and measure limb directions against the bake's targets. */
function verifyWritten(glb: GlbData, bakes: readonly { readonly name: string; readonly bake: HumanoidGltfBake }[], sk: GltfSkeleton): Map<string, number> {
  const h = buildHierarchy(glb);
  const byName = new Map(sk.skeleton.bones.map((b, i) => [b.name, sk.nodes[i]!] as const));
  const out = new Map<string, number>();
  for (const { name, bake } of bakes) {
    const anim = (glb.json.animations ?? []).find((a) => a.name === name);
    if (!anim) throw new AnimationImportError("ANIMATION_IMPORT_VERIFY", `${name}: the written GLB has no animation with this name.`);
    let worst = 0;
    const n = bake.times.length;
    const step = Math.max(1, Math.floor(n / 60));
    for (let f = 0; f < n; f += step) {
      const pos = forward(localPose(glb, anim, bake.times[f]!, h), h).pos;
      const want = bake.expected[f]!;
      for (const [role, tip] of LIMB_SEGMENTS) {
        const w = want[role];
        const a = byName.get(bake.map.roles[role] ?? ""), b = byName.get(bake.map.roles[tip] ?? "");
        if (!w || a === undefined || b === undefined) continue;
        const pa = pos[a]!, pb = pos[b]!;
        worst = Math.max(worst, limbAngleDeg([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], w));
      }
    }
    out.set(name, worst);
  }
  return out;
}

function round(v: number, d = 4): number {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}

/**
 * Retarget clips onto a rigged GLB and write them as glTF animations. Throws AnimationImportError (nothing written)
 * when a source cannot be read or mapped, a clip flips a limb, the retarget error exceeds the bound, or the output
 * would not move the rig. The skin check runs on the written file; `ok` is false (file kept) when it fails.
 */
export async function importClipsOntoRig(opts: ImportClipsOntoRigOptions): Promise<ImportClipsResult> {
  const projectDir = resolve(opts.projectDir ?? process.cwd());
  if (opts.clips.length === 0) throw new AnimationImportError("ANIMATION_IMPORT_USAGE", "animation import needs at least one source clip.");
  const fps = opts.fps ?? 30;
  if (!Number.isFinite(fps) || fps < 1 || fps > 240) throw new AnimationImportError("ANIMATION_IMPORT_USAGE", `--fps must be between 1 and 240 (got ${fps}).`);
  const onto = resolve(projectDir, opts.onto);
  const output = resolve(projectDir, opts.output);
  if (!existsSync(onto)) throw new AnimationImportError("ANIMATION_IMPORT_TARGET", `--onto ${opts.onto}: file not found.`);
  if (extname(onto).toLowerCase() !== ".glb") throw new AnimationImportError("ANIMATION_IMPORT_TARGET", `--onto ${opts.onto}: the target must be a rigged .glb (convert .gltf/.fbx first: aura3d assets convert).`);
  if (extname(output).toLowerCase() !== ".glb") throw new AnimationImportError("ANIMATION_IMPORT_USAGE", `--out ${opts.output}: write a .glb.`);
  const maps = loadRoleMaps(opts.map, projectDir);
  const maxErr = opts.maxLimbErrorDeg ?? 2;
  const warnings: string[] = [];

  // Target rig.
  let target: GlbData;
  try { target = readGlbFile(onto); } catch (error) { throw new AnimationImportError("ANIMATION_IMPORT_TARGET", `--onto ${opts.onto}: ${error instanceof Error ? error.message : String(error)}`); }
  if ((target.json.buffers ?? []).some((b, i) => i === 0 && b.uri)) throw new AnimationImportError("ANIMATION_IMPORT_TARGET", `--onto ${opts.onto}: buffer 0 is external; embed it first (aura3d assets optimize --file).`);
  if (!target.json.skins?.length) throw new AnimationImportError("ANIMATION_IMPORT_TARGET", `--onto ${opts.onto}: the GLB has no skin. Rig it first (aura3d assets generate --rig, or a Mixamo rig).`);
  const targetSk = readGltfSkeleton(target);
  const tFacing = opts.targetFacing && opts.targetFacing !== "auto" ? { facing: opts.targetFacing, method: "explicit" } : detectHumanoidFacing(targetSk.skeleton);
  const driverOpts = { facing: tFacing.facing, ...(maps.target ? { roles: maps.target } : {}), ...(opts.flipThresholdDeg ? { flipThresholdDeg: opts.flipThresholdDeg } : {}) };

  // Sources.
  const loaded: { spec: ImportClipSource; clip: SourceClip; name: string }[] = [];
  for (const spec of opts.clips) {
    const file = resolve(projectDir, spec.file);
    if (!sourceFormatOf(file)) throw new AnimationImportError("ANIMATION_IMPORT_SOURCE", `${spec.file}: unsupported source format. Use .bvh, .fbx, .glb/.gltf or a HY-Motion motion.json.`);
    let clips: SourceClip[];
    try {
      clips = await readSourceClips(file, {
        fps,
        ...(spec.clip ? { clips: [spec.clip] } : opts.sourceClips?.length ? { clips: opts.sourceClips } : {}),
        ...(opts.window ? { window: opts.window } : {}),
        ...(opts.loop ? { loop: true } : {}),
        ...(opts.faceForward === false ? { faceForward: false } : {}),
        ...(opts.rootMotion ? { rootMotion: opts.rootMotion } : {}),
        ...(opts.sourceFacing ? { facing: opts.sourceFacing } : {}),
        ...(maps.source ? { roles: maps.source } : {})
      });
    } catch (error) {
      throw new AnimationImportError("ANIMATION_IMPORT_SOURCE", error instanceof Error ? error.message : String(error));
    }
    if (spec.name && clips.length > 1) throw new AnimationImportError("ANIMATION_IMPORT_USAGE", `${spec.file} has ${clips.length} clips (${clips.map((c) => c.sourceName).join(", ")}); name one with ${spec.name}=${spec.file}#<clip> or pass --clips.`);
    for (const clip of clips) loaded.push({ spec, clip, name: spec.name ?? clip.sourceName });
  }
  const seen = new Set<string>();
  for (const l of loaded) {
    if (!CLIP_NAME.test(l.name)) throw new AnimationImportError("ANIMATION_IMPORT_USAGE", `Clip name "${l.name}" must start with a letter or "_" and use letters, digits, "_", "-", "." or spaces; rename it with name=${l.spec.file}.`);
    if (seen.has(l.name)) throw new AnimationImportError("ANIMATION_IMPORT_USAGE", `Two clips are named "${l.name}"; give each a name with name=file.`);
    seen.add(l.name);
  }

  // Bake + pre-write checks.
  const bakes: { name: string; bake: HumanoidGltfBake; l: (typeof loaded)[number] }[] = [];
  for (const l of loaded) {
    let bake: HumanoidGltfBake;
    try {
      bake = bakeHumanoidFramesToGltf(l.name, targetSk.skeleton, l.clip.frames, fps, driverOpts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/^(createHumanoidDriver|mapHumanoid)/.test(message)) throw error;
      throw new AnimationImportError("ANIMATION_IMPORT_TARGET", `--onto ${opts.onto}: ${message} — pass --map map.json with a "target" role map (e.g. {"target":{"hips":"bone_0","leftUpperArm":"bone_7"}}) or --target-facing.`);
    }
    if (bake.flips.length) {
      const f = bake.flips[0]!;
      throw new AnimationImportError("ANIMATION_IMPORT_LIMB_FLIP", `${l.name}: ${bake.flips.length} limb flip(s) — ${f.track} swings ${f.degrees.toFixed(0)}° in one key at ${(f.keyframeIndex / fps).toFixed(2)} s. Nothing was written. Trim the bad span with --window a,b, check the source facing (--source-facing) or role map (--map), or use a cleaner source clip.`);
    }
    if (bake.limbError.maxDeg > maxErr) {
      throw new AnimationImportError("ANIMATION_IMPORT_RETARGET_ERROR", `${l.name}: retargeted limbs miss the source by up to ${bake.limbError.maxDeg.toFixed(1)}° (bound ${maxErr}°). Nothing was written. Check the target role map (--map) and facing (--target-facing).`);
    }
    if (bake.motionDeg < STATIC_MOTION_DEG) {
      throw new AnimationImportError("ANIMATION_IMPORT_STATIC", `${l.name}: the retargeted clip never moves a limb more than ${bake.motionDeg.toFixed(2)}° from the bind pose (a frozen T-pose). Nothing was written. The source probably did not map: check --map / --source-facing.`);
    }
    bakes.push({ name: l.name, bake, l });
  }

  // Write (or stage), verify, validate.
  const written = writeAnimations(target, bakes, targetSk.nodes, opts.keepBaseAnimations === true);
  const verified = verifyWritten(written, bakes, targetSk);
  for (const [name, err] of verified) {
    if (err > maxErr) throw new AnimationImportError("ANIMATION_IMPORT_VERIFY", `${name}: the written clip's limbs miss the source by ${err.toFixed(1)}° when re-sampled (bound ${maxErr}°). Nothing was written; report this with the source and rig.`);
  }
  const stageDir = opts.dryRun ? join(tmpdir(), `aura3d-animation-import-${process.pid}-${Date.now()}`) : undefined;
  const file = stageDir ? join(stageDir, basename(output)) : output;
  mkdirSync(dirname(file), { recursive: true });
  const { bytes } = writeGlbFile(file, written);
  let skin: ImportClipsResult["skin"];
  try {
    skin = judgeSkin({ projectDir, onto, output, file, target, clips: bakes.map((b) => b.name), strict: opts.strict === true, tolerance: opts.skinTolerance ?? 1.5 });
  } finally {
    if (stageDir) rmSync(stageDir, { recursive: true, force: true });
  }
  const failures = skin && !skin.ok ? skin.failures.map((f) => `skin: ${f}`) : [];
  for (const l of loaded) for (const d of l.clip.diagnostics) warnings.push(`${l.name}: ${d}`);
  const tMap = bakes[0]!.bake.map;
  return {
    ok: failures.length === 0,
    dryRun: opts.dryRun === true,
    output,
    written: !opts.dryRun,
    bytes: opts.dryRun ? bytes : statSync(output).size,
    target: { file: onto, facing: tFacing.facing, facingMethod: tFacing.method, roles: tMap.roles as Record<string, string>, hipHeight: round(tMap.hipHeight) },
    clips: bakes.map(({ name, bake, l }) => ({
      name,
      source: l.spec.file,
      sourceClip: l.clip.sourceName,
      format: l.clip.format,
      duration: round(bake.duration),
      frames: bake.times.length,
      fps,
      channels: bake.channels.length,
      limbErrorDeg: { max: round(bake.limbError.maxDeg), mean: round(bake.limbError.meanDeg) },
      verifiedErrorDeg: round(verified.get(name) ?? 0),
      motionDeg: round(bake.motionDeg, 2),
      flips: bake.flips.length,
      ...(l.clip.facing ? { sourceFacing: `${l.clip.facing.facing} (${l.clip.facing.method})` } : {}),
      ...(l.clip.roles ? { sourceRoles: l.clip.roles } : {}),
      meta: l.clip.meta,
      diagnostics: l.clip.diagnostics
    })),
    animations: (written.json.animations ?? []).map((a) => a.name ?? ""),
    ...(skin ? { skin } : {}),
    failures,
    warnings
  };
}
