/**
 * Shared optimize pipeline — used by `optimizeAssets` (manifest-driven),
 * the CLI verb, and unit/determinism tests (file-driven).
 */

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { unpartition } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { createDecoderModule, createEncoderModule } from "draco3d";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MSFTLod } from "./extensions/msft-lod.js";
import { stepWeld } from "./steps/weld.js";
import { stepDedup } from "./steps/dedup.js";
import { stepJoin } from "./steps/join.js";
import { stepPalette } from "./steps/palette.js";
import { stepResize } from "./steps/resize.js";
import { stepTangents } from "./steps/tangents.js";
import { stepLod } from "./steps/lod.js";
import { stepColliders } from "./steps/colliders.js";
import { stepQuantize } from "./steps/quantize.js";
import { stepCompress } from "./steps/compress.js";
import { stepKtx2 } from "./steps/ktx2.js";
import { generatedPreStage, stepSingleSided, stepSliverCheck } from "./steps/remesh.js";
import { measureBudget, type AssetBudgetMeasurement } from "./measure.js";
import type { AssetOptimizeProfile, OptimizeStepContext, OptimizeStepRecord } from "./types.js";

export interface OptimizeGlbOptions {
  readonly profile: AssetOptimizeProfile;
  readonly geometry?: "meshopt" | "draco" | "none";
  readonly ktxBinary?: string;
  readonly requireKtx2?: boolean;
  /** Mobile texture cap — emit a second `.mobile` GLB when > 0. */
  readonly mobileCap?: number;
  /** §6.5: run the generated-asset pre-stage (sliver check + remesh/bake) before §6.3 steps. */
  readonly fromGenerated?: boolean;
  /** True on the remote worker — §6.5 Blender steps only run there. */
  readonly remote?: boolean;
  /** Explicit blender binary override (else A3D_BLENDER_BINARY / PATH). */
  readonly blenderBinary?: string;
  readonly log?: (line: string) => void;
}

export interface OptimizeGlbResult {
  readonly glb: Uint8Array;
  readonly mobile?: Uint8Array;
  /** `<id>.<hash8>.collision.glb` sidecar bytes when the profile asks for colliders. */
  readonly collisionGlb?: Uint8Array;
  readonly budget: AssetBudgetMeasurement;
  readonly budgetBefore: AssetBudgetMeasurement;
  readonly steps: readonly OptimizeStepRecord[];
  readonly flags: readonly string[];
  readonly extensionsUsed: readonly string[];
  readonly requiredDecoders: readonly ("meshopt" | "draco" | "ktx2")[];
  readonly ktxFlags: OptimizeStepContext["ktxFlags"];
}

export async function makeOptimizeIo(): Promise<NodeIO> {
  return new NodeIO()
    .registerExtensions([...ALL_EXTENSIONS, MSFTLod])
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
      "draco3d.decoder": await createDecoderModule(),
      "draco3d.encoder": await createEncoderModule()
    });
}

const STEP_ORDER = [stepWeld, stepDedup, stepJoin, stepPalette, stepResize, stepTangents, stepLod, stepColliders, stepQuantize, stepCompress, stepKtx2] as const;

async function runSteps(
  source: Uint8Array,
  profile: AssetOptimizeProfile,
  opts: OptimizeGlbOptions,
  io: NodeIO,
  workDir: string
): Promise<{ glb: Uint8Array; collisionGlb?: Uint8Array; ctx: OptimizeStepContext; budget: AssetBudgetMeasurement; budgetBefore: AssetBudgetMeasurement }> {
  const doc = await io.readBinary(source);
  const budgetBefore = measureBudget(doc);
  const steps = opts.fromGenerated
    ? [stepSliverCheck, stepSingleSided, ...STEP_ORDER]
    : [...STEP_ORDER];
  const ctx: OptimizeStepContext = {
    profile,
    steps: [],
    flags: [],
    geometryOverride: opts.geometry,
    ktxBinary: opts.ktxBinary,
    requireKtx2: opts.requireKtx2 ?? false,
    workDir,
    ktxFlags: [],
    log: opts.log ?? (() => {})
  };
  for (const step of steps) await step(doc, ctx);
  // gltf-transform writes each logical buffer's bytes into the shared GLB BIN
  // chunk while keeping every entry in `buffers` — meshopt output in
  // particular always carries a second `EXT_meshopt_compression.fallback`
  // buffer. Aura's GLTFLoader accepts only buffer 0 without a uri, so merge
  // buffers before serialization: one buffers[] entry, one BIN stream.
  await doc.transform(unpartition());
  const glb = await io.writeBinary(doc);
  let collisionGlb: Uint8Array | undefined;
  if (ctx.collisionDoc) {
    // §6.3.7 "meshopt-compressed": encode bufferViews through
    // EXT_meshopt_compression WITHOUT the reorder/quantize transforms — the
    // sidecar keeps float positions so any glTF reader (physics-rapier's
    // sidecar parser included) decodes exact vertices.
    await MeshoptEncoder.ready;
    ctx.collisionDoc.createExtension(EXTMeshoptCompression).setRequired(true);
    await ctx.collisionDoc.transform(unpartition());
    collisionGlb = await io.writeBinary(ctx.collisionDoc);
  }
  return { glb, collisionGlb, ctx, budget: measureBudget(doc, ctx), budgetBefore };
}

export async function optimizeGLB(source: Uint8Array, opts: OptimizeGlbOptions): Promise<OptimizeGlbResult> {
  const io = await makeOptimizeIo();
  const workDir = mkdtempSync(join(tmpdir(), "asset-optimize-"));
  try {
    // §6.5 pre-stage (remesh/bake) runs at byte level before §6.3 steps so the
    // remeshed document — not the raw generated soup — flows through the
    // pipeline. Its step records are prepended to `derived.steps`.
    let pipelineInput = source;
    const preSteps: OptimizeStepRecord[] = [];
    const preFlags: string[] = [];
    if (opts.fromGenerated) {
      const pre = await generatedPreStage(source, io, workDir, {
        remote: opts.remote,
        blenderBinary: opts.blenderBinary,
        profileTargetTriangles: opts.profile.triangles.target,
        log: opts.log,
      });
      pipelineInput = pre.bytes;
      preSteps.push(...pre.steps);
      preFlags.push(...pre.flags);
    }
    const main = await runSteps(pipelineInput, opts.profile, opts, io, workDir);
    main.ctx.steps.unshift(...preSteps);
    main.ctx.flags.unshift(...preFlags);
    const collisionGlb = main.collisionGlb;
    let mobile: Uint8Array | undefined;
    if (opts.mobileCap && opts.profile.textures.maxSize > opts.mobileCap) {
      const mobileProfile = { ...opts.profile, textures: { ...opts.profile.textures, maxSize: opts.mobileCap } };
      // The mobile variant optimizes the SAME (post-pre-stage) geometry.
      mobile = (await runSteps(pipelineInput, mobileProfile, { ...opts, fromGenerated: false }, io, workDir)).glb;
    }
    const extensionsUsed = (await io.readBinary(main.glb)).getRoot().listExtensionsUsed().map((e) => e.extensionName);
    const hasKtx2 = (await io.readBinary(main.glb)).getRoot().listTextures().some((t) => t.getMimeType() === "image/ktx2");
    const requiredDecoders = [
      extensionsUsed.includes("EXT_meshopt_compression") ? "meshopt" : undefined,
      extensionsUsed.includes("KHR_draco_mesh_compression") ? "draco" : undefined,
      hasKtx2 || extensionsUsed.includes("KHR_texture_basisu") ? "ktx2" : undefined
    ].filter((d): d is "meshopt" | "draco" | "ktx2" => d !== undefined);
    return {
      glb: main.glb,
      collisionGlb,
      mobile,
      budget: main.budget,
      budgetBefore: main.budgetBefore,
      steps: main.ctx.steps,
      flags: main.ctx.flags,
      extensionsUsed,
      requiredDecoders,
      ktxFlags: main.ctx.ktxFlags
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
