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
import { contextViewProjection, skyDrawPassFor } from "../atmosphere/SkyBackgroundPass";

/** What the engine-side effects system publishes on the RenderSource. */
export interface VfxFrameSource {
  /** Upsert batches + write this frame's live instances through the hook. */
  feed(hook: ParticleRenderHook): void;
  /** Called once after the contributor collected queue items, with observed stats. */
  afterDraw?(diagnostics: ParticlePassDiagnostics): void;
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

export function particlePassFor(device: RenderDevice): ParticleBatchPass {
  let pass = particlePasses.get(device);
  if (!pass) {
    pass = new ParticleBatchPass(device);
    particlePasses.set(device, pass);
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
    return [pass];
  }
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
  for (const contributor of [particlesContributor, skyContributor, decalsContributor, volumetricContributor]) {
    try {
      registerFrameContributor(contributor);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes(contributor.id))) throw error;
    }
  }
}
