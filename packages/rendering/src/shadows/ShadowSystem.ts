/**
 * ShadowSystem — PRD-02 Phase 4 flag-path shadow orchestration: stable-fit
 * CSM for the sun (DirectionalCascadeFitter) + a depth atlas of spot/point
 * tiles (ShadowAtlas), rendered through DepthPass into one 2D depth target
 * per cascade (depth-only targets via Q-01-5 when the device supports depth
 * textures, 02-T1946). Produces the C-11
 * `ShadowFrameUniforms` for the `prd02.shadowFrameUniforms` blackboard key;
 * the flag-path forward binding reads the extra `cascadeTextures` /
 * `localShadowMatrices` fields on the same object.
 *
 * Rasterization uses each fit/tile's *unbiased* draw VP (`drawViewProjection`);
 * the sampling VP (`viewProjection`, biased to [0,1]³) is what the forward
 * pass multiplies world positions by before comparing.
 */

import type { ShadowPcfTapTier } from "./ShadowFilterTier";
import { DepthPass } from "../DepthPass";
import type { RenderDevice, RenderTarget, RenderTargetDescriptor } from "../RenderDevice";
import type { Texture } from "../Texture";
import type { RenderItem } from "../contracts/renderItem";
import type { ShadowCasterVariantKey, ShadowFrameUniforms } from "../contracts/shadows";
import { shadowCasterVariantId, type DepthVariantFeature } from "../contracts/shadows";
import type { FrameCamera } from "../contracts/frameGraph";
import type { QrFlags } from "../contracts/core";
import type { AuraQualityTierSettings } from "../contracts/quality";
import { shadowFitLegacy } from "./shadowLegacy";
import { fitDirectionalCascades, isOversizeShadowCaster, type CascadeFitterCamera, type DirectionalCascadeFit } from "./DirectionalCascadeFitter";
import { planLocalShadowAtlas, type AtlasTile } from "./ShadowAtlas";
import { unusedCascadeIndices } from "./CascadeUse";
import {
  activeDepthFeatures,
  depthDeformIncompatibility,
  ensurePrd02DepthFeatures,
  prd02DepthFeatures,
  resolvePrd02ShadowCasterVariant,
  precompilePrd02DepthVariants,
  registerPrd02DepthShader
} from "./Prd02DepthShaderLibrary";
import type { ShaderLibrary } from "../ShaderLibraryCore";
import { createLeanCoreShaderLibrary } from "../ShaderLibraryCore";

/** Structural match of the compiler's ShadowSystemConfig (engine-side type). */
export interface ShadowSystemConfigInput {
  readonly enabled: boolean;
  readonly mapSize: number;
  readonly cascades: 1 | 2 | 3 | 4;
  readonly maxDistance: number;
  readonly splitLambda: number;
  readonly filter: "hard" | "pcf" | "pcss";
  readonly strength: number;
  readonly bias: number;
  readonly normalBias: number;
  /** PCF tap-count cap (PRD-2 WP-3), read by Prd02ShadowBridge and passed to the forward shader; unset keeps the kernel as authored. */
  readonly pcfTapTier?: ShadowPcfTapTier;
}

export interface ShadowSystemSun {
  readonly direction: readonly [number, number, number];
}

export interface ShadowSystemLocalLight {
  readonly shadowIndex: number;
  readonly kind: "spot" | "point";
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly range: number;
  readonly outerAngleRadians?: number;
  readonly size?: number;
}

export interface ShadowSystemFrame {
  readonly camera: CascadeFitterCamera | FrameCamera;
  readonly sun?: ShadowSystemSun | null;
  readonly casters: readonly RenderItem[];
  readonly localLights?: readonly ShadowSystemLocalLight[];
  readonly flags: QrFlags;
  readonly tier: AuraQualityTierSettings;
  /**
   * PRD-2 WP-7: the frame's receivers and eye. When present, a cascade no receiver can select (`unusedCascadeIndices`) gets its target
   * allocated but is not redrawn: the legacy forward path never samples it, so no pixel changes. Absent: every cascade is rendered.
   */
  readonly cascadeUse?: {
    readonly receivers: readonly RenderItem[];
    readonly eye: readonly [number, number, number];
  };
}

/** ShadowFrameUniforms plus the extra bindings the PRD-02 forward path needs. */
export interface Prd02ShadowFrameUniforms extends ShadowFrameUniforms {
  /** One depth texture per active cascade (index = cascade). */
  readonly cascadeTextures: readonly (Texture | null)[];
  /** Column-major tile sample VPs, 6 × mat4 (point faces/spots). */
  readonly localShadowMatrices: Float32Array;
  /** 6 × vec4 (lightIndex, tileSlot, 0, 0) for `u_prd02LocalShadowIndex`. */
  readonly localShadowIndexData: Float32Array;
  /** Shadow-map edge in px used for texel-space uniforms. */
  readonly mapSize: number;
}

const ATLAS_SIZE = 1024;
const MAX_CASCADE_TEXTURES = 4;
const MAX_LOCAL_TILES = 6;

export class Prd02ShadowSystem {
  private cascadeTargets: (RenderTarget | null)[] = [];
  private atlasTarget: RenderTarget | null = null;
  private lastFits: DirectionalCascadeFit[] = [];
  private lastTiles: AtlasTile[] = [];
  private lastVariants: string[] = [];
  private lastDropped: string[] = [];
  private lastSkippedCascades: number[] = [];
  private readonly shaderLibrary: ShaderLibrary;
  private depthFeatures: readonly DepthVariantFeature[];
  private precompiled = false;

  constructor(
    private readonly device: RenderDevice,
    private config: ShadowSystemConfigInput,
    shaderLibrary?: ShaderLibrary
  ) {
    ensurePrd02DepthFeatures();
    this.shaderLibrary = shaderLibrary ?? createLeanCoreShaderLibrary();
    registerPrd02DepthShader(this.shaderLibrary);
    this.depthFeatures = prd02DepthFeatures();
  }

  update(frame: ShadowSystemFrame): Prd02ShadowFrameUniforms {
    const { camera } = frame;
    const shadowDistance = Math.min(camera.far ?? Infinity, this.config.maxDistance);
    // The oversize-caster skip is part of the 4.3.0 fit; legacy mode (the default) keeps every caster as 4.2.0 did.
    const oversize = shadowFitLegacy() ? [] : frame.casters.filter((item) => isOversizeShadowCaster(item, shadowDistance));
    const casters = oversize.length > 0 ? frame.casters.filter((item) => !oversize.includes(item)) : frame.casters;
    const sun = frame.sun ?? null;
    this.lastFits = sun
      ? fitDirectionalCascades({
          camera,
          lightDirection: sun.direction,
          casters,
          mapSize: this.config.mapSize,
          cascadeCount: this.config.cascades,
          splitLambda: this.config.splitLambda,
          maxDistance: this.config.maxDistance
        })
      : [];
    const localRequests = (frame.localLights ?? []).map((light) => ({
      lightIndex: light.shadowIndex,
      kind: light.kind,
      size: light.size ?? 256,
      position: light.position,
      direction: light.direction,
      range: light.range,
      outerAngleRadians: light.outerAngleRadians
    }));
    const plannedTiles = planLocalShadowAtlas(localRequests, ATLAS_SIZE).tiles;
    this.lastTiles = plannedTiles.slice(0, MAX_LOCAL_TILES);
    // C-31 droppedFeatures: report any local light whose tiles didn't fit.
    this.lastDropped = [];
    for (const item of oversize) this.lastDropped.push(`shadow.caster.oversize:${item.label ?? "unnamed"}`);
    if (plannedTiles.length > this.lastTiles.length) {
      const keptCounts = new Map<number, number>();
      for (const tile of this.lastTiles) {
        keptCounts.set(tile.lightIndex, (keptCounts.get(tile.lightIndex) ?? 0) + 1);
      }
      for (const light of localRequests) {
        const needed = light.kind === "point" ? 6 : 1;
        if ((keptCounts.get(light.lightIndex) ?? 0) < needed) {
          this.lastDropped.push(`shadow.localLight:${light.lightIndex}`);
        }
      }
    }

    // 02-DEPTH: compose every active C-11 depth feature (all lanes), not only
    // prd02's own; deform features without a C-18 entry point are reported.
    this.depthFeatures = activeDepthFeatures(frame.flags);
    for (const feature of this.depthFeatures) {
      if (!feature.hooks.includes("vertex:deform")) continue;
      const reason = depthDeformIncompatibility(feature);
      if (reason) this.lastDropped.push(`depth.deform:${reason}`);
    }
    const variantKeys = new Map<string, { key: ShadowCasterVariantKey; features: readonly DepthVariantFeature[] }>();
    const resolve = (item: RenderItem): ShadowCasterVariantKey =>
      resolvePrd02ShadowCasterVariant(item, frame.flags, frame.tier, this.depthFeatures);
    for (const caster of casters) {
      const key = resolve(caster);
      variantKeys.set(shadowCasterVariantId(key), { key, features: this.depthFeatures });
    }
    this.lastVariants = [...variantKeys.keys()].sort();

    const viewProjection = "viewProjectionMatrix" in camera ? camera.viewProjectionMatrix : undefined;
    const skip = frame.cascadeUse && viewProjection
      ? unusedCascadeIndices(this.lastFits, frame.cascadeUse.receivers, viewProjection, frame.cascadeUse.eye)
      : undefined;
    this.lastSkippedCascades = skip ? [...skip].sort() : [];
    this.renderCascades(casters, resolve, skip);
    this.renderAtlas(casters, resolve);
    return this.frameUniforms();
  }

  /** One-time async warm-up so steady-state `programCompileCount` delta is 0. */
  async precompile(frame: Omit<ShadowSystemFrame, "sun" | "localLights">): Promise<void> {
    this.depthFeatures = activeDepthFeatures(frame.flags);
    const variants = new Map<string, { key: ShadowCasterVariantKey; features: readonly DepthVariantFeature[] }>();
    for (const caster of frame.casters) {
      const key = resolvePrd02ShadowCasterVariant(caster, frame.flags, frame.tier, this.depthFeatures);
      variants.set(shadowCasterVariantId(key), { key, features: this.depthFeatures });
    }
    await precompilePrd02DepthVariants(this.device, this.shaderLibrary, variants);
    this.precompiled = true;
  }

  get isPrecompiled(): boolean {
    return this.precompiled;
  }

  /** T0-26: the sun cascade fits of the last `update` (bridge → legacy forward options). */
  cascadeFits(): readonly DirectionalCascadeFit[] {
    return this.lastFits;
  }

  /** Diagnostics for the C-31 `shadows` section (observed values only). */
  diagnostics(): {
    readonly cascadeCount: number;
    readonly tiles: number;
    readonly localLights: number;
    readonly casterVariants: readonly string[];
    readonly droppedFeatures: readonly string[];
    readonly skippedCascades: readonly number[];
  } {
    return {
      skippedCascades: this.lastSkippedCascades,
      cascadeCount: this.lastFits.length,
      tiles: this.lastTiles.length,
      localLights: new Set(this.lastTiles.map((tile) => tile.lightIndex)).size,
      casterVariants: this.lastVariants,
      droppedFeatures: this.lastDropped
    };
  }

  /**
   * GPU evidence probe (shadow-pixels investigation): min/max/mean of each
   * rendered cascade's depth texture via `readDepthPixels`, plus the share of
   * texels nearer than the cleared far plane. A healthy cascade over casters
   * has `covered > 0` and `min < 1`; an all-1.0 map means casters never
   * reached the depth surface. Call between frames (sets the render target).
   */
  readCascadeDepthStats(): { index: number; width: number; min: number; max: number; mean: number; covered: number }[] {
    if (!this.device.readDepthPixels) return [];
    const prev = this.device.getRenderTarget?.() ?? null;
    const out: { index: number; width: number; min: number; max: number; mean: number; covered: number }[] = [];
    try {
      for (const fit of this.lastFits) {
        const target = this.cascadeTargets[fit.index];
        if (!target || target.disposed || !target.depthTexture) continue;
        this.device.setRenderTarget(target);
        const depth = this.device.readDepthPixels(0, 0, target.width, target.height);
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        let covered = 0;
        for (const d of depth) {
          if (d < min) min = d;
          if (d > max) max = d;
          sum += d;
          if (d < 0.9999) covered += 1;
        }
        out.push({ index: fit.index, width: target.width, min, max, mean: sum / Math.max(1, depth.length), covered: covered / Math.max(1, depth.length) });
      }
    } finally {
      this.device.setRenderTarget(prev);
    }
    return out;
  }

  dispose(): void {
    for (const target of this.cascadeTargets) target?.dispose();
    this.cascadeTargets = [];
    this.atlasTarget?.dispose();
    this.atlasTarget = null;
  }

  /**
   * 02-T1946: shadow maps only need the sampled depth surface. With
   * `depth-textures` the targets are depth-only (Q-01-5) — no rgba8 colour
   * attachment, saving 4·size² bytes per target; otherwise keep the rgba8 +
   * depth-texture target the device can always build.
   */
  private depthTargetDescriptor(size: number, label: string): RenderTargetDescriptor {
    return this.device.info.capabilities?.includes("depth-textures")
      ? { width: size, height: size, label, depthOnly: true }
      : { width: size, height: size, label, format: "rgba8", depth: "texture" };
  }

  private ensureCascadeTarget(index: number): RenderTarget {
    const existing = this.cascadeTargets[index];
    if (existing && !existing.disposed && existing.width === this.config.mapSize) return existing;
    existing?.dispose();
    const target = this.device.createRenderTarget(this.depthTargetDescriptor(this.config.mapSize, `prd02-cascade-${index}`));
    this.cascadeTargets[index] = target;
    return target;
  }

  private ensureAtlasTarget(): RenderTarget {
    if (this.atlasTarget && !this.atlasTarget.disposed) return this.atlasTarget;
    this.atlasTarget = this.device.createRenderTarget(this.depthTargetDescriptor(ATLAS_SIZE, "prd02-local-shadow-atlas"));
    return this.atlasTarget;
  }

  private depthPassOptions(
    casters: readonly RenderItem[],
    resolve: (item: RenderItem) => ShadowCasterVariantKey,
    viewProjection: Float32Array,
    scissor?: { x: number; y: number; width: number; height: number }
  ) {
    return {
      casters,
      shaderLibrary: this.shaderLibrary,
      viewProjectionMatrix: viewProjection,
      variantResolver: resolve,
      depthVariantFeatures: this.depthFeatures,
      ...(scissor ? { scissor } : {})
    };
  }

  private renderCascades(casters: readonly RenderItem[], resolve: (item: RenderItem) => ShadowCasterVariantKey, skip?: ReadonlySet<number>): void {
    if (casters.length === 0) return;
    const prevTarget = this.device.getRenderTarget?.() ?? null;
    try {
      for (const fit of this.lastFits) {
        const target = this.ensureCascadeTarget(fit.index);
        // Allocated (the frame uniforms need its texture) but never sampled this frame: no clear, no casters.
        if (skip?.has(fit.index)) continue;
        this.device.setRenderTarget(target);
        this.device.clearRenderTarget?.([1, 1, 1, 1]);
        new DepthPass(this.depthPassOptions(casters, resolve, fit.drawViewProjection))
          .execute({ device: this.device, width: this.config.mapSize, height: this.config.mapSize });
      }
    } finally {
      this.device.setRenderTarget(prevTarget);
    }
  }

  private renderAtlas(casters: readonly RenderItem[], resolve: (item: RenderItem) => ShadowCasterVariantKey): void {
    if (this.lastTiles.length === 0 || casters.length === 0) return;
    const target = this.ensureAtlasTarget();
    const prevTarget = this.device.getRenderTarget?.() ?? null;
    try {
      this.device.setRenderTarget(target);
      this.device.clearRenderTarget?.([1, 1, 1, 1]);
      for (const tile of this.lastTiles) {
        new DepthPass(this.depthPassOptions(casters, resolve, tile.drawViewProjection, tile.scissor))
          .execute({ device: this.device, width: ATLAS_SIZE, height: ATLAS_SIZE });
      }
    } finally {
      this.device.setRenderTarget(prevTarget);
    }
  }

  private frameUniforms(): Prd02ShadowFrameUniforms {
    const cascadeMatrices = new Float32Array(MAX_CASCADE_TEXTURES * 16);
    const cascadeSplits = new Float32Array(4).fill(1);
    const cascadeTexelWorld = new Float32Array(4);
    for (const fit of this.lastFits.slice(0, MAX_CASCADE_TEXTURES)) {
      cascadeMatrices.set(fit.viewProjection, fit.index * 16);
      cascadeSplits[fit.index] = fit.splitFar;
      cascadeTexelWorld[fit.index] = fit.texelWorld;
    }
    // localShadowData packs 6 slots × vec4: [u0, v0, du, dv] atlas rect (1-texel
    // guard included) — the fragment shader offsets tile-space UVs by it.
    const localShadowData = new Float32Array(MAX_LOCAL_TILES * 4);
    const localShadowMatrices = new Float32Array(MAX_LOCAL_TILES * 16);
    const localShadowIndexData = new Float32Array(MAX_LOCAL_TILES * 4);
    const perLightShadowIndex = new Int32Array(this.lastTiles.length * 2);
    for (const [i, tile] of this.lastTiles.entries()) {
      const atlas = tile.allocation;
      localShadowData.set(
        [atlas.x / ATLAS_SIZE, atlas.y / ATLAS_SIZE, atlas.width / ATLAS_SIZE, atlas.height / ATLAS_SIZE],
        i * 4
      );
      localShadowMatrices.set(tile.viewProjection, i * 16);
      perLightShadowIndex.set([tile.lightIndex, i], i * 2);
      localShadowIndexData.set([tile.lightIndex, i, 0, 0], i * 4);
    }
    const cascadeTextures: (Texture | null)[] = [];
    for (let i = 0; i < MAX_CASCADE_TEXTURES; i += 1) {
      cascadeTextures.push(this.cascadeTargets[i]?.depthTexture ?? null);
    }
    return {
      cascadeTexture: cascadeTextures[0] ?? null,
      cascadeTextures,
      cascadeMatrices,
      cascadeSplits,
      cascadeTexelWorld,
      atlasTexture: this.atlasTarget?.depthTexture ?? null,
      localShadowData,
      localShadowMatrices,
      localShadowIndexData,
      perLightShadowIndex,
      mapSize: this.config.mapSize
    };
  }
}

export function createShadowSystem(device: RenderDevice, config: ShadowSystemConfigInput): Prd02ShadowSystem {
  return new Prd02ShadowSystem(device, config);
}
