/**
 * PRD 11 Phase 2 (§6.8) — the CPU-readback guard for production postprocess.
 *
 * `guardPostprocessPlan` is a pure plan filter: a pass stays in the chain only
 * when it is GPU-expressible — in the fusable LDR set (the same list
 * `canFuseLdrPostprocess` in renderer/PostprocessExecution.ts checks), with
 * the caller attesting `gpuFusable` (native `device.presentLdrPostprocess`)
 * and `hasDepthTexture` (the chain's source target carries a sampleable depth
 * attachment for depth-sampling passes) — or when it is a C-13 `gpuOnly`
 * registered pass. Anything else would reach `executePixelPostprocessPass` or
 * the fused CPU fallback and perform a synchronous GPU readback, so it is
 * dropped (or, in strict mode, throws) instead of silently stalling the frame.
 *
 * `cpuDeterministic` passes the plan through untouched: the CPU kernels remain
 * callable when `postprocess.execution === "cpu-deterministic"` (tests and
 * MockRenderDevice).
 *
 * Lane 03 calls this at the top of `executePostprocess`/`executePostprocessAsync`
 * in renderer/PostprocessExecution.ts (request Q-03-1, behind `A3D_QR_TIERS`);
 * it supplies the booleans from the live device and current target. Mode comes
 * from C-36 `SceneCompileContext.strict` (`A3D_QR_STRICT`) at the call site.
 */

import { RenderDeviceError } from "../RenderDevice";
import { registeredPostPasses } from "../contracts/post";

/** LDR passes the production fused path can express on the GPU. Mirrors `canFuseLdrPostprocess`. */
const FUSABLE_LDR_PASSES: ReadonlySet<string> = new Set([
  "bloom",
  "tone-mapping",
  "color-grade",
  "depth-of-field",
  "motion-blur",
  "ssao",
  "ssr",
  "taa",
  "outline",
  "fxaa"
]);

/**
 * Fusable passes that sample the frame's depth attachment through
 * `depthTextureHandle`. `volumetric-light` and `contact-shadow` also read
 * depth but are not fusable, so they already fail the fusable check.
 * Caller-supplied CPU depth bindings decline fusion caller-side (they feed
 * `hasDepthTexture`), so they are already covered by this rule.
 */
const DEPTH_SAMPLING_LDR_PASSES: ReadonlySet<string> = new Set([
  "depth-of-field",
  "ssao",
  "ssr"
]);

export interface PostprocessGuardOptions {
  /** `"throw"` comes from C-36 `SceneCompileContext.strict` (`A3D_QR_STRICT`); production passes `"drop"`. */
  readonly mode: "throw" | "drop";
  /** `Boolean(device.presentLdrPostprocess)` — the fused GPU path exists. */
  readonly gpuFusable: boolean;
  /** The chain's source target carries a sampleable depth attachment (`target.depthTexture`). */
  readonly hasDepthTexture: boolean;
  /** `postprocess.execution === "cpu-deterministic"` — CPU kernels are legal; the plan passes through. */
  readonly cpuDeterministic: boolean;
}

export interface PostprocessGuardResult<P> {
  /** Passes kept in order — the GPU-expressible plan. */
  readonly passes: readonly P[];
  /** Names of passes removed because they have no GPU implementation here. */
  readonly dropped: readonly string[];
}

const warnedDropped = new Set<string>();

/**
 * Filter a postprocess plan to the passes this device can run on the GPU.
 * `mode: "throw"` raises `POSTPROCESS_PASS_CPU_ONLY`; `"drop"` removes the
 * offending passes and warns `POSTPROCESS_PASS_DROPPED:<name>` once per name.
 */
export function guardPostprocessPlan<P extends { readonly name: string }>(
  passes: readonly P[],
  options: PostprocessGuardOptions
): PostprocessGuardResult<P> {
  if (options.cpuDeterministic) return { passes, dropped: [] };
  const gpuOnlyIds = new Set(registeredPostPasses().map((pass) => pass.id));
  const kept: P[] = [];
  const droppedNames: string[] = [];
  for (const pass of passes) {
    const expressible = gpuOnlyIds.has(pass.name)
      || (FUSABLE_LDR_PASSES.has(pass.name)
        && options.gpuFusable
        && (!DEPTH_SAMPLING_LDR_PASSES.has(pass.name) || options.hasDepthTexture));
    if (expressible) kept.push(pass);
    else droppedNames.push(pass.name);
  }
  if (droppedNames.length === 0) return { passes: kept, dropped: droppedNames };
  if (options.mode === "throw") {
    throw new RenderDeviceError("Postprocess pass has no GPU implementation", "POSTPROCESS_PASS_CPU_ONLY", {
      passes: droppedNames
    });
  }
  for (const name of droppedNames) {
    const key = `POSTPROCESS_PASS_DROPPED:${name}`;
    if (!warnedDropped.has(key)) {
      warnedDropped.add(key);
      console.warn(key);
    }
  }
  return { passes: kept, dropped: droppedNames };
}

/** Test hook: forget which `POSTPROCESS_PASS_DROPPED` warnings already fired. */
export function resetPostprocessGuardWarnings(): void {
  warnedDropped.clear();
}
