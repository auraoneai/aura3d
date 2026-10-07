/**
 * Shared optimize pipeline — used by `optimizeAssets` (manifest-driven),
 * the CLI verb, and unit/determinism tests (file-driven).
 */

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
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
import { stepQuantize } from "./steps/quantize.js";
import { stepCompress } from "./steps/compress.js";
import { stepKtx2 } from "./steps/ktx2.js";
import { measureBudget, type AssetBudgetMeasurement } from "./measure.js";
import type { AssetOptimizeProfile, OptimizeStepContext, OptimizeStepRecord } from "./types.js";

export interface OptimizeGlbOptions {
  readonly profile: AssetOptimizeProfile;
  readonly geometry?: "meshopt" | "draco" | "none";
  readonly ktxBinary?: string;
  readonly requireKtx2?: boolean;
  /** Mobile texture cap — emit a second `.mobile` GLB when > 0. */
  readonly mobileCap?: number;
  readonly log?: (line: string) => void;
}

export interface OptimizeGlbResult {
  readonly glb: Uint8Array;
  readonly mobile?: Uint8Array;
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

const STEP_ORDER = [stepWeld, stepDedup, stepJoin, stepPalette, stepResize, stepTangents, stepQuantize, stepCompress, stepKtx2] as const;

async function runSteps(
  source: Uint8Array,
  profile: AssetOptimizeProfile,
  opts: OptimizeGlbOptions,
  io: NodeIO,
  workDir: string
): Promise<{ glb: Uint8Array; ctx: OptimizeStepContext; budget: AssetBudgetMeasurement; budgetBefore: AssetBudgetMeasurement }> {
  const doc = await io.readBinary(source);
  const budgetBefore = measureBudget(doc);
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
  for (const step of STEP_ORDER) await step(doc, ctx);
  const glb = await io.writeBinary(doc);
  return { glb, ctx, budget: measureBudget(doc, ctx), budgetBefore };
}

export async function optimizeGLB(source: Uint8Array, opts: OptimizeGlbOptions): Promise<OptimizeGlbResult> {
  const io = await makeOptimizeIo();
  const workDir = mkdtempSync(join(tmpdir(), "asset-optimize-"));
  try {
    const main = await runSteps(source, opts.profile, opts, io, workDir);
    let mobile: Uint8Array | undefined;
    if (opts.mobileCap && opts.profile.textures.maxSize > opts.mobileCap) {
      const mobileProfile = { ...opts.profile, textures: { ...opts.profile.textures, maxSize: opts.mobileCap } };
      mobile = (await runSteps(source, mobileProfile, opts, io, workDir)).glb;
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
