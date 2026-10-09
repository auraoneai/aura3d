// PRD-07 P1-T1/P1-T8 — frame contributors and the per-device pass registry.
// The engine reaches contributors through `ctx.source` (the RenderSource the
// Renderer was handed, populated via attachRootRenderSource): the engine's
// ProductionEffectSystem publishes a `vfx` feed + atmosphere state there.

import type { RenderDevice } from "../RenderDevice";
import {
  registerFrameContributor,
  type FrameContributor,
  type FrameContributorContext,
  type TransparentQueueItem
} from "../contracts/frameGraph";
import type { RenderSource } from "../contracts/renderSource";
import type { RenderItem } from "../contracts/renderItem";
import type { ParticleRenderHook } from "../contracts/particles";
import type { AuraSkySpecLike } from "../contracts/atmosphere";
import { ParticleBatchPass, type ParticlePassDiagnostics } from "./ParticleBatchPass";
import { BeamPass, type BeamDrawSpec } from "./BeamPass";
import { MeshParticlePass, type MeshParticleFeed } from "./MeshParticlePass";
import { RibbonBatch } from "./RibbonBatch";
import {
  PRD07_FOG_DEFAULTS,
  packV2,
  parseFogColor,
  resolvePrd07FogSpec,
  skyHorizonRadiance,
  type Vec3
} from "../atmosphere/HeightFog";
import { packFogVolumes, type Prd07FogVolume } from "../atmosphere/FogVolumes";
import { evaluateSky, skyFrame } from "../atmosphere/SkyEval";
import { RibbonPass } from "./RibbonPass";
import { DecalPass } from "./DecalPass";
import type { DecalBatch } from "./DecalBatch";
import { resolveSceneDepth } from "./SceneDepthAdapter";
import { contextViewProjection, skyDrawPassFor } from "../atmosphere/SkyBackgroundPass";
import { VolumetricFogPass, froxelGridFor, type VolumetricFogPassInput, type FroxelGridSpec } from "../atmosphere/VolumetricFogPass";
import type { PackedFogUniforms } from "../atmosphere/HeightFog";

/** What the engine-side effects system publishes on the RenderSource. */
export interface VfxFrameSource {
  /** Upsert batches + write this frame's live instances through the hook. */
  feed(hook: ParticleRenderHook): void;
  /** Called once after the contributor collected queue items, with observed stats. */
  afterDraw?(diagnostics: ParticlePassDiagnostics): void;
  /** P2-T7 transient lights — read by the prd07.lights contributor in collect. */
  lightsFeed?(): readonly import("../LightCollector").CollectedLight[];
  /** §6.2.9 ribbon ring owned by the engine system; prd07.ribbons draws it. */
  ribbonFeed?(): RibbonBatch;
  /** §6.2.10 beam-family draw specs for prd07.beams. */
  beamFeed?(): readonly BeamDrawSpec[];
  /** §6.2.11 instanced mesh batches for prd07.mesh. */
  meshFeed?(): readonly MeshParticleFeed[];
  /** §6.9 merged decal ring for prd07.decals (P6-T1). */
  decalFeed?(): DecalBatch;
}

/** What the engine-side atmosphere state publishes on the RenderSource. */
export interface AtmosphereFrameSource {
  readonly sky: AuraSkySpecLike | null;
}

export interface Prd07FrameSource extends RenderSource {
  readonly vfx?: VfxFrameSource | null;
  readonly atmosphere?: AtmosphereFrameSource | null;
}

const particlePasses = new WeakMap<RenderDevice, ParticleBatchPass>();
const ribbonPasses = new WeakMap<RenderDevice, RibbonPass>();
const beamPasses = new WeakMap<RenderDevice, BeamPass>();
const meshPasses = new WeakMap<RenderDevice, MeshParticlePass>();
const decalPasses = new WeakMap<RenderDevice, DecalPass>();

export function particlePassFor(device: RenderDevice): ParticleBatchPass {
  let pass = particlePasses.get(device);
  if (!pass) {
    pass = new ParticleBatchPass(device);
    particlePasses.set(device, pass);
  }
  return pass;
}

export function ribbonPassFor(device: RenderDevice): RibbonPass {
  let pass = ribbonPasses.get(device);
  if (!pass) {
    pass = new RibbonPass(device);
    ribbonPasses.set(device, pass);
  }
  return pass;
}

export function beamPassFor(device: RenderDevice): BeamPass {
  let pass = beamPasses.get(device);
  if (!pass) {
    pass = new BeamPass(device);
    beamPasses.set(device, pass);
  }
  return pass;
}

export function meshPassFor(device: RenderDevice): MeshParticlePass {
  let pass = meshPasses.get(device);
  if (!pass) {
    pass = new MeshParticlePass(device);
    meshPasses.set(device, pass);
  }
  return pass;
}

const particlesContributor: FrameContributor = {
  id: "prd07.particles",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["collect", "transparent"],
  collect(items: RenderItem[], ctx: FrameContributorContext): RenderItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    if (vfx) vfx.feed(particlePassFor(ctx.device));
    return items;
  },
  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    if (!vfx) return [];
    const pass = particlePassFor(ctx.device);
    const items = pass.transparentItems(ctx);
    vfx.afterDraw?.(pass.diagnostics);
    return items;
  }
};

/** P2-T7: transient pool lights — collected in the C-01 collect phase. */
const lightsContributor: FrameContributor = {
  id: "prd07.lights",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["collect"],
  collect(items: RenderItem[], ctx: FrameContributorContext): RenderItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const lights = vfx?.lightsFeed?.() ?? [];
    // CollectedLights ride `source.collectedLights` into the forward light
    // merge (collectRenderLights); the blackboard copy keeps them visible to
    // sibling contributors in the same phase.
    ctx.blackboard.set("prd07.lights", lights);
    return items;
  }
};

/** §6.2.9 trails — RibbonPass submits one draw per orientation group. */
const ribbonContributor: FrameContributor = {
  id: "prd07.ribbons",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["transparent"],
  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const batch = vfx?.ribbonFeed?.();
    if (!batch) return [];
    return ribbonPassFor(ctx.device).transparentItems(batch, ctx);
  }
};

/** §6.2.10 beams, light cones, aurora curtains — one draw per beam node. */
const beamContributor: FrameContributor = {
  id: "prd07.beams",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["transparent"],
  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const specs = vfx?.beamFeed?.() ?? [];
    if (specs.length === 0) return [];
    return beamPassFor(ctx.device).transparentItems(specs, ctx);
  }
};

/** §6.2.11 instanced mesh particles — one instanced draw per batch. */
const meshContributor: FrameContributor = {
  id: "prd07.mesh",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["transparent"],
  transparentItems(ctx: FrameContributorContext): TransparentQueueItem[] {
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const feeds = vfx?.meshFeed?.() ?? [];
    if (feeds.length === 0) return [];
    return meshPassFor(ctx.device).transparentItems(feeds, ctx);
  }
};

const skyContributor: FrameContributor = {
  id: "prd07.sky",
  owner: "prd07",
  flag: "A3D_QR_VFX_SKY",
  phases: ["background"],
  passes: (_phase, ctx) => {
    const atmosphere = (ctx.source as Prd07FrameSource).atmosphere;
    if (!atmosphere?.sky) return [];
    const pass = skyDrawPassFor(ctx.device);
    pass.setSpec(atmosphere.sky, ctx.timeSeconds);
    pass.setViewProjection(contextViewProjection(ctx));
    // P4-T7 — the prd07.fog contributor's collect ran first this frame; when the
    // spec affects the background, bind its packed §8.4 uniforms (mode, colour,
    // volumes) + camera/sun so a3dApplyFog shades the sky at backgroundDistance.
    const fogEntry = ctx.flags.on("A3D_QR_VFX_FOG")
      ? (ctx.blackboard.get("prd07.fog") as
          | {
              uniforms: ReturnType<typeof packV2>;
              volumes: readonly Prd07FogVolume[];
              sunColor: Vec3;
              affectsBackground: boolean;
              backgroundDistance: number;
            }
          | undefined)
      : undefined;
    pass.setFog(
      fogEntry && fogEntry.affectsBackground
        ? {
            uniforms: fogEntry.uniforms,
            volumes: packFogVolumes(fogEntry.volumes),
            sunColor: fogEntry.sunColor,
            cameraPosition: ctx.camera?.position ?? [0, 0, 0],
            backgroundDistance: fogEntry.backgroundDistance
          }
        : null
    );
    return [pass];
  }
};

/**
 * P4-T4 — prd07.fog: notes the camera pose on LiveAtmosphere (the compiler's
 * packLegacy path reads it) and publishes the packed §8.4 uniforms +
 * fog-volume segments on the blackboard for the prd07.sky pass and any
 * C-02 generator material that binds `a3d_prd07_fog`.
 */
const fogContributor: FrameContributor = {
  id: "prd07.fog",
  owner: "prd07",
  flag: "A3D_QR_VFX_FOG",
  phases: ["background"],
  collect: (items, ctx) => {
    const atmosphere = (ctx.source as Prd07FrameSource).atmosphere as {
      resolveFog?: (t: number) => Record<string, unknown> | null;
      fogVolumes?: () => readonly unknown[];
      noteCamera?: (position: readonly [number, number, number], forward: readonly [number, number, number]) => void;
      clockNow?: () => number;
      sky?: Record<string, unknown> | null;
    } | undefined;
    if (!atmosphere) return items;
    const cam = ctx.camera;
    const forward: readonly [number, number, number] = cam
      ? [-cam.viewMatrix[2], -cam.viewMatrix[6], -cam.viewMatrix[10]]
      : [0, 0, -1];
    if (cam) atmosphere.noteCamera?.(cam.position, forward);
    const spec = atmosphere.resolveFog?.(atmosphere.clockNow?.() ?? ctx.timeSeconds) ?? null;
    const resolved = resolvePrd07FogSpec(spec as Parameters<typeof resolvePrd07FogSpec>[0]);
    const sky = atmosphere.sky ?? null;
    const azimuth = Math.atan2(forward[0], forward[2]);
    const fogColor = resolved.color === "sky"
      ? skyHorizonRadiance(sky, azimuth) ?? PRD07_FOG_DEFAULTS.fallbackColor
      : parseFogColor(resolved.color, PRD07_FOG_DEFAULTS.fallbackColor);
    // Legacy generator (C-04 stub) → parity-mode slots; real C-02 → v2 slots.
    const parity = ctx.flags.values["A3D_QR_CORE"] !== "v2";
    const packed = packV2(resolved, {
      fogColor,
      cameraY: cam?.position[1] ?? 0,
      parity
    });
    // §6.6 sun inscatter colour — sky radiance at the sun direction (clamped);
    // only multiplied by sunInscatter (default 0) so the approximation is inert.
    let sunColor: Vec3 = [1, 1, 1];
    if (sky) {
      try {
        const frame = skyFrame(sky as Parameters<typeof skyFrame>[0]);
        const sunDir = frame.preetham?.sunDirection ?? frame.gradient?.sunDirection ?? ([0, 1, 0] as Vec3);
        const e = evaluateSky(frame, sunDir);
        sunColor = [Math.min(e[0], 8), Math.min(e[1], 8), Math.min(e[2], 8)];
      } catch {
        // keep the unit fallback
      }
    }
    ctx.blackboard.set("prd07.fog", {
      uniforms: packed,
      volumes: (atmosphere.fogVolumes?.() ?? []) as readonly Prd07FogVolume[],
      sunColor,
      affectsBackground: resolved.affectsBackground !== false,
      backgroundDistance: resolved.backgroundDistance ?? cam?.far ?? 1000
    });
    return items;
  },
  passes: () => []
};

/**
 * P5-T1 — prd07.gpuSim: steps each ParticleGpuSim published on the blackboard
 * under "prd07.gpuSims" (engine producers push {sim, emitCount}) during the
 * collect phase — before shadows — so draws read frame N-1 state (§6.2.3).
 * Requires floatColorBuffer; producers gate on `ParticleGpuSim.isAvailable`
 * and keep the CPU emitter otherwise (PARTICLE_GPU_UNAVAILABLE).
 */
const gpuSimContributor: FrameContributor = {
  id: "prd07.gpuSim",
  owner: "prd07",
  flag: "A3D_QR_VFX",
  phases: ["collect"],
  collect: (items, ctx) => {
    const sims = ctx.blackboard.get("prd07.gpuSims") as readonly { sim: { step(dt: number, emitCount: number, time: number): unknown }; emitCount: number }[] | undefined;
    if (!sims) return items;
    for (const entry of sims) entry.sim.step(1 / 60, entry.emitCount, ctx.timeSeconds);
    return items;
  },
  passes: () => []
};

/**
 * P6-T1 — prd07.decals (§6.9): merged page×blend draws after opaque, before
 * transparents. Decal nodes (hidden `prd07.legacyDecal.*` primitives under
 * the flag) are published by the engine on `vfx.decalFeed()`; one draw per
 * page×blend group replaces E46's one-draw-per-decal.
 */
function decalPassFor(device: RenderDevice): DecalPass {
  let pass = decalPasses.get(device);
  if (!pass) {
    pass = new DecalPass(device, {
      fog: true,
      fogUniforms: (ctx) => {
        const entry = ctx.blackboard.get("prd07.fog") as
          | { uniforms: PackedFogUniforms; volumes: readonly Prd07FogVolume[]; sunColor: Vec3 }
          | undefined;
        if (!entry) return null;
        const f = entry.uniforms;
        return new Map<string, import("../RenderDevice").UniformValue>([
          ["u_fogA", f.fogA],
          ["u_fogB", f.fogB],
          ["u_fogColor", f.fogColor],
          ["u_fogAbsorption", f.fogAbsorption],
          ["u_fogMode", f.fogMode],
          ["u_fogNear", f.fogNear],
          ["u_fogFar", f.fogFar],
          ["u_fogVolumes", packFogVolumes(entry.volumes)],
          ["u_cameraPosition", [...(ctx.camera?.position ?? [0, 0, 0])]],
          ["u_sunColor", [...entry.sunColor]]
        ]);
      },
      onNote: (code, message) => console.warn(`[${code}] ${message}`)
    });
    decalPasses.set(device, pass);
  }
  return pass;
}

export const decalsContributor: FrameContributor = {
  id: "prd07.decals",
  owner: "prd07",
  flag: "A3D_QR_VFX_DECALS",
  phases: ["after-opaque"],
  passes: (phase, ctx) => {
    if (phase !== "after-opaque") return [];
    const vfx = (ctx.source as Prd07FrameSource).vfx;
    const batch = vfx?.decalFeed?.();
    if (!batch || batch.size === 0) return [];
    const pass = decalPassFor(ctx.device);
    const now = ctx.timeSeconds;
    return [{
      name: "prd07.decals",
      reads: ["aura.scene.depth"],
      writes: ["aura.scene.color"],
      execute: () => pass.draw(batch, ctx, now)
    }];
  }
};

/** Per-device froxel pass cache — the grid spec selects the atlas layout. */
const volumetricPasses = new WeakMap<import("../RenderDevice").RenderDevice, Map<string, VolumetricFogPass>>();

// C-31 measured-cost gate (FIX-froxel-cost): a runtime that measures the
// volumetric pass feeds samples through `notePrd07VolumetricGpuMs`; once the
// EWMA clears the tier budget for 8+ frames the contributor stops emitting
// the froxel pass and the analytic fog path covers it instead.
interface VolumetricCostEntry { ewma: number; frames: number; fallback: boolean }
const volumetricCost = new WeakMap<RenderDevice, VolumetricCostEntry>();

/** Feed one measured volumetric-GPU-ms sample for `device`. */
export function notePrd07VolumetricGpuMs(device: RenderDevice, ms: number): void {
  const s = volumetricCost.get(device) ?? { ewma: 0, frames: 0, fallback: false };
  s.ewma = s.frames === 0 ? ms : s.ewma * 0.8 + ms * 0.2;
  s.frames += 1;
  volumetricCost.set(device, s);
}

const WEBDRIVER = (globalThis as { navigator?: { webdriver?: boolean } }).navigator?.webdriver === true;
/** C-31 atmosphere scope of the §18 tier envelope: 1.2ms medium / 2.0ms high;
 *  WebDriver (software GL) pins the tight 0.6ms cap. */
export function froxelBudgetMs(tier: { readonly volumetricFog?: string | null }): number {
  if (WEBDRIVER) return 0.6;
  return tier.volumetricFog === "froxel-high" ? 2.0 : 1.2;
}

/** EWMA-with-hysteresis gate — true while the measured cost exceeds `budgetMs`. */
export function prd07VolumetricCostFallback(device: RenderDevice, budgetMs: number): boolean {
  const s = volumetricCost.get(device);
  if (!s || s.frames < 8) return s?.fallback ?? false;
  s.fallback = s.fallback ? s.ewma > budgetMs * 0.75 : s.ewma > budgetMs;
  return s.fallback;
}

function volumetricPassFor(device: import("../RenderDevice").RenderDevice, grid: FroxelGridSpec): VolumetricFogPass {
  const key = `${grid.tileWidth}x${grid.tileHeight}x${grid.slices}`;
  let map = volumetricPasses.get(device);
  if (!map) volumetricPasses.set(device, (map = new Map()));
  let pass = map.get(key);
  if (!pass) map.set(key, (pass = new VolumetricFogPass(device, grid)));
  return pass;
}

/**
 * P5-T6 — prd07.volumetric: froxel volumetrics (§6.7). Runs only when the
 * C-27 tier maps to a froxel grid AND `resolveSceneDepth(ctx).available`
 * (the stub reports false → VOLUMETRIC_DEPTH_PENDING, analytic fog covers
 * every tier instead). Temporal reprojection (Ultra) needs C-01
 * previousViewProjectionMatrix — null → VOLUMETRIC_TEMPORAL_PENDING.
 */
const volumetricContributor: FrameContributor = {
  id: "prd07.volumetric",
  owner: "prd07",
  flag: "A3D_QR_VFX_VOLUMETRIC",
  phases: ["after-opaque"],
  passes: (phase, ctx) => {
    if (phase !== "after-opaque") return [];
    const depth = resolveSceneDepth(ctx);
    const grid = froxelGridFor(ctx.tier.volumetricFog);
    if (!grid || !depth.available || !ctx.camera) return [];
    if (prd07VolumetricCostFallback(ctx.device, froxelBudgetMs(ctx.tier))) {
      ctx.blackboard.set("prd07.volumetric.costFallback", "VOLUMETRIC_COST_FALLBACK");
      return [];
    }
    const pass = volumetricPassFor(ctx.device, grid);
    // Fog spec comes from the prd07.fog blackboard entry (written in collect).
    const fogEntry = ctx.flags.on("A3D_QR_VFX_FOG")
      ? (ctx.blackboard.get("prd07.fog") as { uniforms?: PackedFogUniforms; volumes?: readonly Prd07FogVolume[]; sunColor?: Vec3 } | undefined)
      : undefined;
    const sky = ((ctx.source as Prd07FrameSource).atmosphere as { sky?: Record<string, unknown> | null } | undefined)?.sky ?? null;
    let sunDirection: Vec3 = [0, 1, 0];
    if (sky) {
      try {
        const frame = skyFrame(sky as Parameters<typeof skyFrame>[0]);
        sunDirection = frame.preetham?.sunDirection ?? frame.gradient?.sunDirection ?? sunDirection;
      } catch { /* keep default */ }
    }
    const input: VolumetricFogPassInput = {
      fog: fogEntry?.uniforms ?? null,
      fogColor: [0.663, 0.737, 0.812],
      volumes: fogEntry?.volumes ?? [],
      sunDirection,
      sunColor: (fogEntry?.sunColor ?? [1, 1, 1]) as Vec3,
      ambientColor: [0.2, 0.22, 0.26],
      sceneDepth: depth.source.texture,
      depthLinearize: [depth.source.linearize.near, depth.source.linearize.far, depth.source.linearize.orthographic ? 1 : 0, 0]
    };
    return [{
      name: "prd07.volumetric",
      reads: ["aura.scene.depth", "aura.scene.color"],
      writes: ["aura.scene.color"],
      execute: () => {
        const { apply } = pass.update(input, ctx);
        apply(null); // stub target: the canvas framebuffer (after-opaque).
      }
    }];
  }
};

/** Idempotent lane registration (P1-T1): safe on repeated barrel imports. */
export function registerPrd07Contributors(): void {
  for (const contributor of [particlesContributor, lightsContributor, ribbonContributor, beamContributor, meshContributor, gpuSimContributor, fogContributor, skyContributor, decalsContributor, volumetricContributor]) {
    try {
      registerFrameContributor(contributor);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes(contributor.id))) throw error;
    }
  }
}
