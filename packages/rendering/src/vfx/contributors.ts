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
import { contextViewProjection, skyDrawPassFor } from "../atmosphere/SkyBackgroundPass";

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

const decalsContributor: FrameContributor = {
  id: "prd07.decals",
  owner: "prd07",
  flag: "A3D_QR_VFX_DECALS",
  phases: ["after-opaque"],
  passes: () => []
};

const volumetricContributor: FrameContributor = {
  id: "prd07.volumetric",
  owner: "prd07",
  flag: "A3D_QR_VFX_VOLUMETRIC",
  phases: ["after-opaque", "post-hdr"],
  passes: () => []
};

/** Idempotent lane registration (P1-T1): safe on repeated barrel imports. */
export function registerPrd07Contributors(): void {
  for (const contributor of [particlesContributor, lightsContributor, ribbonContributor, beamContributor, meshContributor, fogContributor, skyContributor, decalsContributor, volumetricContributor]) {
    try {
      registerFrameContributor(contributor);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes(contributor.id))) throw error;
    }
  }
}
