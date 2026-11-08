/**
 * ShadowSystem — PRD-02 Phase 4 flag-path shadow orchestration: stable-fit
 * CSM for the sun (DirectionalCascadeFitter) + a depth atlas of spot/point
 * tiles (ShadowAtlas), rendered through DepthPass into one 2D target per
 * cascade. Targets expose depth textures on WebGL and encoded color on WebGPU.
 * Produces the C-11
 * `ShadowFrameUniforms` for the `prd02.shadowFrameUniforms` blackboard key;
 * the flag-path forward binding reads the extra `cascadeTextures` /
 * `localShadowMatrices` fields on the same object.
 *
 * Rasterization uses each fit/tile's *unbiased* draw VP (`drawViewProjection`);
 * the sampling VP (`viewProjection`, biased to [0,1]³) is what the forward
 * pass multiplies world positions by before comparing.
 */

import { withStandardDeviceDepth } from "../renderer/FrameDepthConvention";
import type { ShadowPcfTapTier } from "./ShadowFilterTier";
import { DepthPass, assertStableDepthClippingInputs, depthAlphaVariantForItem, type PreparedDepthPlan } from "../DepthPass";
import { RenderDeviceError, type RenderDevice, type RenderTarget, type RenderTargetDescriptor } from "../RenderDevice";
import type { RenderPassContext } from "../RenderPass";
import type { Texture } from "../Texture";
import type { RenderItem } from "../contracts/renderItem";
import type { ShadowCasterVariantKey, ShadowFrameUniforms } from "../contracts/shadows";
import { shadowCasterVariantId, type DepthVariantFeature } from "../contracts/shadows";
import type { FrameCamera } from "../contracts/frameGraph";
import type { QrFlags } from "../contracts/core";
import type { AuraQualityTierSettings } from "../contracts/quality";
import { shadowFitLegacy } from "./shadowLegacy";
import { cameraDepthOf, fitDirectionalCascades, isOversizeShadowCaster, type CascadeFitterCamera, type DirectionalCascadeFit } from "./DirectionalCascadeFitter";
import { planLocalShadowAtlas, type AtlasTile } from "./ShadowAtlas";
import { unusedCascadeIndices, type CascadeUseCamera } from "./CascadeUse";
import {
  activeDepthFeatures,
  depthDeformIncompatibility,
  ensurePrd02DepthFeatures,
  prd02DepthFeatures,
  prd02DepthVariantForVertexFormat,
  resolvePrd02ShadowCasterVariant,
  precompilePrd02DepthVariants,
  registerPrd02DepthShader
} from "./Prd02DepthShaderLibrary";
import type { ShaderLibrary } from "../ShaderLibraryCore";
import { createLeanCoreShaderLibrary } from "../ShaderLibraryCore";
import { resolveRenderGeometry } from "../forward/Deform";
import { createClippingBinding, type ClippingGroupInput } from "../ClippingPlanes";
import { MaterialInstance } from "../MaterialInstance";
import { expandLogicalBatchItems } from "../batching/BatchMembers";

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
  /** The same scene eye used for forward custom-vertex displacement. */
  readonly cameraPosition?: readonly [number, number, number];
  /** The same frame time used for forward custom-vertex displacement. */
  readonly timeSeconds?: number;
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
    /** What the forward pass gets as `cameraViewMatrix` / `cameraPosition` (see `CascadeUseCamera`). */
    readonly camera: CascadeUseCamera;
  };
}

/** ShadowFrameUniforms plus the extra bindings the PRD-02 forward path needs. */
export interface Prd02ShadowFrameUniforms extends ShadowFrameUniforms {
  /** One sampled shadow texture per cascade: depth on WebGL, encoded color on WebGPU. */
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

interface PreparedShadowDraw {
  readonly pass: DepthPass;
  readonly plan: PreparedDepthPlan;
  readonly context: RenderPassContext;
}

interface PreparedShadowFrame {
  readonly cascades: ReadonlyMap<number, PreparedShadowDraw>;
  readonly tiles: readonly PreparedShadowDraw[];
  readonly all: readonly PreparedShadowDraw[];
}

function disposePreparedShadowDraws(draws: readonly PreparedShadowDraw[]): void {
  const errors: unknown[] = [];
  for (const draw of draws) {
    try { draw.plan.dispose(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "Prepared shadow depth cleanup failed");
}

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
    this.resetFrameState();
    try {
      if (this.device.kind === "webgpu" && typeof this.device.getRenderTarget !== "function") {
        throw new RenderDeviceError("WebGPU shadow passes require render-target state restoration.", "SHADOW_TARGET_STATE_UNAVAILABLE");
      }
      return this.updateFrame(frame);
    } catch (error) {
      // No diagnostics or cascade fits from a partially submitted frame may
      // be mistaken for a completed set. Targets remain owned for retry.
      this.resetFrameState();
      throw error;
    }
  }

  private resetFrameState(): void {
    this.lastFits = [];
    this.lastTiles = [];
    this.lastVariants = [];
    this.lastDropped = [];
    this.lastSkippedCascades = [];
  }

  private updateFrame(frame: ShadowSystemFrame): Prd02ShadowFrameUniforms {
    const { camera } = frame;
    const shadowDistance = Math.min(camera.far ?? Infinity, this.config.maxDistance);
    // The oversize-caster skip is part of the 4.3.0 fit; legacy mode (the default) keeps every caster as 4.2.0 did.
    const oversize = shadowFitLegacy() ? [] : frame.casters.filter((item) => isOversizeShadowCaster(item, shadowDistance));
    const casters = oversize.length > 0 ? frame.casters.filter((item) => !oversize.includes(item)) : frame.casters;
    const sun = frame.sun ?? null;
    this.lastFits = sun
      ? fitDirectionalCascades({
          // FrameCamera carries `depth`; a reversed camera's VP is re-expressed in standard depth by the fitter.
          camera: cameraDepthOf(camera) ? { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far, depth: cameraDepthOf(camera) } : camera,
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

    const skip = frame.cascadeUse
      ? unusedCascadeIndices(this.lastFits, frame.cascadeUse.receivers, frame.cascadeUse.camera)
      : undefined;
    // Feature selectors are caller-extensible. Reject existing clipping
    // accessors before they can be observed by a selector, then check again
    // immediately before plans in case a selector changes an input.
    this.assertStableMultiTargetClipping(casters, skip);

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

    this.lastSkippedCascades = skip ? [...skip].sort() : [];
    const cameraPosition = frame.cameraPosition ?? (camera as Partial<FrameCamera>).position ?? frame.cascadeUse?.camera.eye;
    const prepared = this.prepareShadowFrame(casters, resolve, cameraPosition, frame.timeSeconds, skip);
    let uniforms: Prd02ShadowFrameUniforms;
    try {
      // Light depth stays standard inside reversed/logarithmic camera frames.
      withStandardDeviceDepth(this.device, () => {
        this.renderCascades(casters, resolve, cameraPosition, frame.timeSeconds, skip, prepared);
        this.renderAtlas(casters, resolve, cameraPosition, frame.timeSeconds, prepared);
      });
      uniforms = this.frameUniforms();
    } catch (error) {
      try { disposePreparedShadowDraws(prepared?.all ?? []); }
      catch (cleanup) { throw new AggregateError([error, cleanup], "Shadow rendering and prepared depth cleanup failed"); }
      throw error;
    }
    disposePreparedShadowDraws(prepared?.all ?? []);
    return uniforms;
  }

  /** One-time async warm-up so steady-state `programCompileCount` delta is 0. */
  async precompile(frame: Omit<ShadowSystemFrame, "sun" | "localLights">): Promise<void> {
    this.depthFeatures = activeDepthFeatures(frame.flags);
    const variants = new Map<string, { key: ShadowCasterVariantKey; features: readonly DepthVariantFeature[] }>();
    for (const caster of frame.casters) {
      // DepthPass skips empty instance sets and applies CPU morphs before it
      // selects a variant. Mirror that preparation here: a morph-aware feature
      // must see the same geometry and cleared morph fields as the actual draw.
      if (caster.instanceTransforms !== undefined && caster.instanceTransforms.length === 0) continue;
      const hasMorph = caster.morphTargets !== undefined || caster.morphWeights !== undefined;
      const geometry = hasMorph ? resolveRenderGeometry(caster) : caster.geometry;
      try {
        const prepared = hasMorph
          ? { ...caster, geometry, shadowGeometry: undefined, morphTargets: undefined, morphWeights: undefined }
          : caster;
        let key = resolvePrd02ShadowCasterVariant(prepared, frame.flags, frame.tier, this.depthFeatures);
        // ShadowSystem supplies no pass-wide clipping override, so mirror the
        // item/material groups DepthPass reads and the shadow-only opt-in.
        const clipItem = prepared as RenderItem & { readonly globalClipping?: ClippingGroupInput; readonly materialClipping?: ClippingGroupInput };
        const base = prepared.material instanceof MaterialInstance ? prepared.material.baseMaterial : prepared.material;
        const clipping = createClippingBinding({
          global: clipItem.globalClipping,
          material: clipItem.materialClipping ?? (base as (typeof base & { readonly clipping?: ClippingGroupInput }))?.clipping,
          pass: "shadow",
          primitive: prepared.geometry.topology === "lines" ? "line" : prepared.geometry.topology === "points" ? "point" : "mesh",
          backend: this.device.kind
        });
        if (clipping.groups.length > 0) key = { ...key, features: { ...key.features, "a3d.clipping": true } };
        // Match the depth draw after morph preparation and clipping selection,
        // including UV0 (whose feature value is zero) and vertex-alpha inputs.
        key = depthAlphaVariantForItem(prepared, key, this.device);
        // Masked depth must use the original geometry to preserve coverage.
        // Unmasked casters may instead draw a shadow proxy, so do not validate
        // their original layout as if it were necessarily the submitted one.
        if (key.alphaTest && (this.device.kind === "webgpu" || this.device.kind === "webgl2")) {
          key = prd02DepthVariantForVertexFormat(key, prepared.geometry.vertexBuffer.format, this.device.kind);
        }
        variants.set(shadowCasterVariantId(key), { key, features: this.depthFeatures });
      } finally {
        if (geometry !== caster.geometry) geometry.dispose();
      }
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
    this.resetFrameState();
    for (const target of this.cascadeTargets) target?.dispose();
    this.cascadeTargets = [];
    this.atlasTarget?.dispose();
    this.atlasTarget = null;
  }

  /**
   * WebGL uses depth-only targets when depth textures are available, saving
   * the color attachment. WebGPU graph receivers use the encoded color
   * attachment and an ordinary depth attachment for raster depth testing.
   */
  private depthTargetDescriptor(size: number, label: string): RenderTargetDescriptor {
    // WebGPU graph receivers sample encoded depth through texture_2d<f32>.
    // The GPU depth attachment is still used for raster depth testing, but is
    // not bound as a float texture or an unsupported comparison sampler.
    if (this.device.kind === "webgpu") return { width: size, height: size, label, format: "rgba8", depth: true };
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
    cameraPosition: readonly [number, number, number] | undefined,
    timeSeconds: number | undefined,
    scissor?: { x: number; y: number; width: number; height: number }
  ) {
    return {
      casters,
      shaderLibrary: this.shaderLibrary,
      viewProjectionMatrix: viewProjection,
      cameraPosition,
      timeSeconds,
      checkedSubmission: this.device.kind === "webgpu",
      variantResolver: resolve,
      depthVariantFeatures: this.depthFeatures,
      ...(scissor ? { scissor } : {})
    };
  }

  private assertStableMultiTargetClipping(casters: readonly RenderItem[], skip?: ReadonlySet<number>): void {
    const fits = this.lastFits.filter((fit) => !skip?.has(fit.index));
    if (fits.length + this.lastTiles.length <= 1) return;
    // Each target receives its own single-use plan. Reject accessor-backed
    // clipping before any plan can observe a different value; ordinary data
    // groups are copied by each synchronous preparation before target clears.
    for (const caster of expandLogicalBatchItems(casters)) {
      if (caster.instanceTransforms !== undefined && caster.instanceTransforms.length === 0) continue;
      assertStableDepthClippingInputs(caster);
    }
  }

  private prepareShadowFrame(casters: readonly RenderItem[], resolve: (item: RenderItem) => ShadowCasterVariantKey,
    cameraPosition: readonly [number, number, number] | undefined, timeSeconds: number | undefined,
    skip?: ReadonlySet<number>): PreparedShadowFrame | undefined {
    if (casters.length === 0) return undefined;
    const fits = this.lastFits.filter((fit) => !skip?.has(fit.index));
    if (fits.length === 0 && this.lastTiles.length === 0) return undefined;
    const firstProjection = fits[0]?.drawViewProjection ?? this.lastTiles[0]!.drawViewProjection;
    this.assertStableMultiTargetClipping(casters, skip);
    if (this.device.activeFrameToken === undefined) {
      // Preserve the legacy third-party path for unclipped casters only; it
      // cannot guarantee preflight across the entire shadow frame.
      const pass = new DepthPass(this.depthPassOptions(casters, resolve, firstProjection, cameraPosition, timeSeconds));
      pass.assertLegacyDepthFallback({ device: this.device, width: this.config.mapSize, height: this.config.mapSize });
      return undefined;
    }
    const cascades = new Map<number, PreparedShadowDraw>();
    const tiles: PreparedShadowDraw[] = [];
    const all: PreparedShadowDraw[] = [];
    const prepare = (viewProjection: Float32Array, size: number, scissor?: AtlasTile["scissor"]): PreparedShadowDraw => {
      const pass = new DepthPass(this.depthPassOptions(casters, resolve, viewProjection, cameraPosition, timeSeconds, scissor));
      const context = { device: this.device, width: size, height: size };
      const plan = pass.prepare(context);
      const draw = { pass, plan, context };
      all.push(draw);
      pass.validatePrepared(context, plan);
      return draw;
    };
    try {
      for (const fit of fits) cascades.set(fit.index, prepare(fit.drawViewProjection, this.config.mapSize));
      for (const tile of this.lastTiles) tiles.push(prepare(tile.drawViewProjection, ATLAS_SIZE, tile.scissor));
      // A later preparation can invalidate an earlier plan through shared
      // resources. Recheck the whole set before clearing the first target.
      for (const draw of all) draw.pass.validatePrepared(draw.context, draw.plan);
      return { cascades, tiles, all };
    } catch (error) {
      try { disposePreparedShadowDraws(all); }
      catch (cleanup) { throw new AggregateError([error, cleanup], "Shadow preparation and prepared depth cleanup failed"); }
      throw error;
    }
  }

  private renderCascades(casters: readonly RenderItem[], resolve: (item: RenderItem) => ShadowCasterVariantKey,
    cameraPosition: readonly [number, number, number] | undefined, timeSeconds: number | undefined,
    skip: ReadonlySet<number> | undefined, prepared: PreparedShadowFrame | undefined): void {
    if (casters.length === 0) return;
    const prevTarget = this.device.getRenderTarget?.() ?? null;
    try {
      for (const fit of this.lastFits) {
        const target = this.ensureCascadeTarget(fit.index);
        // Allocated (the frame uniforms need its texture) but never sampled this frame: no clear, no casters.
        if (skip?.has(fit.index)) continue;
        const draw = prepared?.cascades.get(fit.index);
        if (prepared && !draw) throw new RenderDeviceError("Prepared cascade depth is missing", "SHADOW_PREPARED_PLAN_MISSING", { cascade: fit.index });
        if (draw) draw.pass.validatePrepared(draw.context, draw.plan);
        this.device.setRenderTarget(target);
        if (draw) draw.pass.validatePrepared(draw.context, draw.plan);
        this.device.clearRenderTarget?.([1, 1, 1, 1]);
        if (draw) draw.pass.executePrepared(draw.context, draw.plan);
        else new DepthPass(this.depthPassOptions(casters, resolve, fit.drawViewProjection, cameraPosition, timeSeconds))
          .execute({ device: this.device, width: this.config.mapSize, height: this.config.mapSize });
      }
    } finally {
      this.device.setRenderTarget(prevTarget);
    }
  }

  private renderAtlas(casters: readonly RenderItem[], resolve: (item: RenderItem) => ShadowCasterVariantKey,
    cameraPosition: readonly [number, number, number] | undefined, timeSeconds: number | undefined,
    prepared: PreparedShadowFrame | undefined): void {
    if (this.lastTiles.length === 0 || casters.length === 0) return;
    const target = this.ensureAtlasTarget();
    const prevTarget = this.device.getRenderTarget?.() ?? null;
    try {
      for (const draw of prepared?.tiles ?? []) draw.pass.validatePrepared(draw.context, draw.plan);
      this.device.setRenderTarget(target);
      for (const draw of prepared?.tiles ?? []) draw.pass.validatePrepared(draw.context, draw.plan);
      this.device.clearRenderTarget?.([1, 1, 1, 1]);
      for (const [index, tile] of this.lastTiles.entries()) {
        const draw = prepared?.tiles[index];
        if (prepared && !draw) throw new RenderDeviceError("Prepared atlas depth is missing", "SHADOW_PREPARED_PLAN_MISSING", { tile: index });
        if (draw) draw.pass.executePrepared(draw.context, draw.plan);
        else new DepthPass(this.depthPassOptions(casters, resolve, tile.drawViewProjection, cameraPosition, timeSeconds, tile.scissor))
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
      const target = this.cascadeTargets[i];
      cascadeTextures.push(target ? (this.device.kind === "webgpu" ? target.colorTexture : target.depthTexture ?? null) : null);
    }
    return {
      cascadeTexture: cascadeTextures[0] ?? null,
      cascadeTextures,
      cascadeMatrices,
      cascadeSplits,
      cascadeTexelWorld,
      atlasTexture: this.atlasTarget ? (this.device.kind === "webgpu" ? this.atlasTarget.colorTexture : this.atlasTarget.depthTexture ?? null) : null,
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
