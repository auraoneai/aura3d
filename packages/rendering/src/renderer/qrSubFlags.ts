import type { QrFlagName, QrFlags } from "../contracts/core";
import type { RenderDevice } from "../RenderDevice";
import { programCacheSlot, type ProgramCacheLike, type ProgramDegradationLike } from "../contracts/program";
import { frameUniformsSlot, type FrameUniformsLike } from "../contracts/frameUniforms";
import { OutputPass } from "../output/OutputPass";

/**
 * PRD-01 §15 sub-flag resolution: `A3D_QR_CORE_GENERATOR` and
 * `A3D_QR_CORE_OUTPUT` default ON under `A3D_QR_CORE=v2` and can be excluded
 * per-capture (`?a3d-qr=core,-core_generator`) for attribution. Explicit
 * values always win.
 */
function subFlagOn(flags: QrFlags, sub: QrFlagName, lane: QrFlagName): boolean {
  const explicit = flags.values[sub];
  return explicit !== undefined ? flags.on(sub) : flags.on(lane);
}

/**
 * E3 conjunction (Live Fix stages 1/2a/2b): the physical-lighting data path
 * is live only when the compiler lane AND the lighting lane are both on.
 * `A3D_QR_LIGHTING` is default-on while `A3D_QR_COMPILER` is dev, so every
 * shipped scene is conjunction-off today and must stay byte-identical.
 */
export function qrE3CompilerLightingOn(flags: QrFlags): boolean {
  return flags.on("A3D_QR_COMPILER") && flags.on("A3D_QR_LIGHTING");
}

/** Generated-program path (C-02) vs. frozen legacy shaderKey path. */
export function qrCoreGeneratorOn(flags: QrFlags): boolean {
  return subFlagOn(flags, "A3D_QR_CORE_GENERATOR", "A3D_QR_CORE");
}

/**
 * PRD-04 lobe route: the r185 lobes (sheen, iridescence, anisotropy, specular,
 * dispersion, …) exist only as generated-program chunks — the legacy
 * pbr-direct shader has no code for them. Gating every generated draw on
 * `A3D_QR_CORE` meant `materials` alone selected lobes no program ever
 * consumed (byte-identical frames). With `A3D_QR_MATERIALS` on, lobe-bearing
 * materials route through the generator unless the generator is explicitly
 * excluded (`-core_generator`); lobe-free materials stay legacy.
 */
export function qrMaterialsLobeProgramsOn(flags: QrFlags): boolean {
  return flags.values.A3D_QR_CORE_GENERATOR === undefined && flags.on("A3D_QR_MATERIALS");
}

/** Any draw may use a generated program this frame (UBO, warmup, cache frame bounds). */
export function qrGeneratedProgramsOn(flags: QrFlags): boolean {
  return qrCoreGeneratorOn(flags) || qrMaterialsLobeProgramsOn(flags);
}

/** HDR offscreen target + OutputPass present+encode path (C-23). */
export function qrCoreOutputOn(flags: QrFlags): boolean {
  return subFlagOn(flags, "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE");
}

/**
 * Select the shared generator's providers for the materials-only route.
 * This view is used only by C-02/C-08 provider lookup: the cache receives
 * the original flags, so no core feature, output pass or other lane is enabled.
 */
function generatedProviderFlags(flags: QrFlags): QrFlags {
  if (!qrMaterialsLobeProgramsOn(flags) || flags.on("A3D_QR_CORE")) return flags;
  return {
    values: flags.values,
    on: (name) => name === "A3D_QR_CORE" || flags.on(name)
  };
}

// ── Device-scoped singletons (C-02/C-08) ─────────────────────────────────
// The generated-program cache and the AuraFrame UBO belong to the device, not a
// pass instance: the Renderer warms it and ForwardPass acquires from it.

const caches = new WeakMap<RenderDevice, ProgramCacheLike>();
const auraFrames = new WeakMap<RenderDevice, FrameUniformsLike>();
const degradationSinks = new WeakMap<RenderDevice, (degradation: ProgramDegradationLike) => void>();

/**
 * T0-05 (a): C-36 sink for this device's generated-program degradations
 * (`extension-lobe-pending`, `program-compile-failed`). Late-bound: the cache
 * forwards to whatever sink is installed when the degradation happens, so the
 * engine mount (C-38 `onDegradation`, lane 15) can install it after the
 * renderer has already created the cache. Pass `undefined` to clear.
 */
export function setRendererProgramDegradationSink(device: RenderDevice, sink: ((degradation: ProgramDegradationLike) => void) | undefined): void {
  if (sink) degradationSinks.set(device, sink);
  else degradationSinks.delete(device);
}

export function rendererProgramCache(device: RenderDevice, flags: QrFlags): ProgramCacheLike {
  let cache = caches.get(device);
  if (!cache) {
    // T0-05 (a): without `flags` the real generator resolves no ShaderFeature
    // contributors and no C-03 lobes, so no registered chunk ever reaches a
    // generated program.
    // #1140: if the lane-01 barrel was tree-shaken out of the bundle, the slot
    // silently hands back the PR-0a stub (legacy pbr-direct for every lit
    // record: no maps, no instancing → flat frames). Report it loudly.
    if (!programCacheSlot.provided && qrGeneratedProgramsOn(flags)) {
      const degradation = {
        code: "program-generator-missing",
        message: "A3D_QR_CORE generator is on but the C-02 real program cache was never provided (lanes/prd01 not loaded — tree-shaken?); using the stub legacy-PBR cache",
        ownerPrd: 1
      };
      console.error(`[prd01] ${degradation.message}`);
      degradationSinks.get(device)?.(degradation);
    }
    cache = programCacheSlot.get(generatedProviderFlags(flags))(device, {
      flags,
      onDegradation: (degradation) => degradationSinks.get(device)?.(degradation)
    });
    caches.set(device, cache);
  }
  return cache;
}

/**
 * PRD-01 Phase 6 (C-31): read-only access for diagnostics — never creates the
 * singleton, so callers that lack the app's QrFlags can't pollute the map.
 */
export function rendererProgramCachePeek(device: RenderDevice): ProgramCacheLike | undefined {
  return caches.get(device);
}

export function rendererAuraFrame(device: RenderDevice, flags: QrFlags): FrameUniformsLike {
  let fu = auraFrames.get(device);
  if (!fu) {
    fu = frameUniformsSlot.get(generatedProviderFlags(flags))(device);
    auraFrames.set(device, fu);
  }
  return fu;
}

// ── C-05: the OutputPass belongs to the device — one shader-variant cache ──

const outputPasses = new WeakMap<RenderDevice, OutputPass>();

export function rendererOutputPass(device: RenderDevice): OutputPass {
  let pass = outputPasses.get(device);
  if (!pass) {
    pass = new OutputPass(device);
    outputPasses.set(device, pass);
  }
  return pass;
}
