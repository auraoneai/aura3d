import { withStandardDeviceDepth } from "./renderer/FrameDepthConvention";
import { Light, type SceneNode } from "@aura3d/scene";
import { DepthPass, assertStableDepthClippingInputs, type PreparedDepthPlan } from "./DepthPass";
import { type ForwardShadowMapOptions, type RenderItem } from "./ForwardPass";
import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { RenderDeviceError, type RenderDeviceDiagnostics, type RenderTarget } from "./RenderDevice";
import { type RenderPassContext } from "./RenderPass";
import { Sampler } from "./Sampler";
import { ShadowMap } from "./ShadowMap";
import { type ShaderLibrary } from "./ShaderLibraryCore";
import { TextureBinding } from "./TextureBinding";
import { rendererQrFlags } from "./renderer/FrameGraph";
import type { DepthConvention } from "./DepthConvention";
import { expandLogicalBatchItems } from "./batching/BatchMembers";

/** Reject clipping accessors before separately prepared maps can read them differently. */
export function assertStableMultiTargetShadowClipping(casters: readonly RenderItem[]): void {
  for (const caster of expandLogicalBatchItems(casters)) {
    if (caster.instanceTransforms !== undefined && caster.instanceTransforms.length === 0) continue;
    assertStableDepthClippingInputs(caster);
  }
}

/**
 * Check inherited visibility only when an explicit boundary contains the light.
 * Standalone lights have no identifiable scene root, so otherwise retain their
 * existing local-visibility semantics.
 * @internal
 */
export function isShadowLightVisible(light: Light, root?: SceneNode): boolean {
  const localVisible = light.visible;
  if (!root || !localVisible || root === light) return localVisible;
  let node: SceneNode | null = light.parent;
  while (node && node !== root) node = node.parent;
  if (!node) return localVisible;
  node = light.parent;
  while (node && node !== root) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return node ? node.visible : localVisible;
}

export interface ShadowPassOptions {
  readonly light: Light | null;
  readonly casters: readonly RenderItem[];
  /**
   * Include visibility through this root (inclusive), ignoring ancestors above
   * it. If omitted or neither the light nor its ancestor, check only the light.
   */
  readonly visibilityRoot?: SceneNode;
  readonly shadowMap?: ShadowMap;
  readonly shaderLibrary?: ShaderLibrary;
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
  /** Main scene eye used by camera-dependent custom vertex displacement. */
  readonly cameraPosition?: readonly [number, number, number];
  /** Frame time shared with the forward pass's custom vertex stage. */
  readonly timeSeconds?: number;
  /** Convention of the light projection, independent of the scene camera. */
  readonly depthConvention?: DepthConvention;
  /**
   * A depth render target owned by the caller and reused across passes.
   *
   * `Renderer` constructs a new `ShadowPass` every frame, so a pass-owned target is allocated and
   * destroyed once per frame. Creating a render target allocates textures and runs
   * `checkFramebufferStatus`, both synchronous GPU operations: measured on the Aura Clash playable
   * route that was 3 `createTexture` + 3 `checkFramebufferStatus` calls per frame. When supplied,
   * the pass renders into this target and never disposes it, leaving lifetime to the owner.
   */
  readonly renderTarget?: RenderTarget;
}

export interface ShadowPassResult {
  readonly rendered: boolean;
  readonly reason: ShadowPassReason;
  readonly casterCount: number;
  readonly skippedTransparentCasters: number;
  readonly targetBacked: boolean;
  readonly shadowTextureLabel?: string;
  readonly shadowTextureKind?: ShadowTextureKind;
  readonly diagnostics: RenderDeviceDiagnostics;
}

export type ShadowPassReason = "rendered" | "no-light" | "light-disabled" | "not-shadow-casting" | "no-casters" | "no-opaque-casters";
export type ShadowTextureKind = "depth-texture" | "encoded-color-depth";

export class ShadowPass {
  public readonly shadowMap: ShadowMap;
  private lastResult: ShadowPassResult | null = null;
  private renderTarget: RenderTarget | null = null;
  private ownsRenderTarget = false;
  private sampleColorDepth = false;

  constructor(private readonly options: ShadowPassOptions) {
    this.shadowMap = options.shadowMap ?? new ShadowMap();
  }

  execute(context: RenderPassContext): ShadowPassResult {
    // A previous successful frame must not remain publishable if this
    // attempt fails before, during, or after a caster submission.
    this.lastResult = null;
    const skipReason = this.getSkipReason();
    if (skipReason) {
      this.lastResult = {
        rendered: false,
        reason: skipReason,
        casterCount: 0,
        skippedTransparentCasters: 0,
        targetBacked: false,
        diagnostics: context.device.getDiagnostics()
      };
      return this.lastResult;
    }

    const opaqueCasters = this.options.casters.filter((caster) => !isTransparentCaster(caster));
    const skippedTransparentCasters = this.options.casters.length - opaqueCasters.length;
    if (opaqueCasters.length === 0) {
      this.lastResult = {
        rendered: false,
        reason: "no-opaque-casters",
        casterCount: 0,
        skippedTransparentCasters,
        targetBacked: false,
        diagnostics: context.device.getDiagnostics()
      };
      return this.lastResult;
    }

    const convention = this.options.depthConvention;
    // Shadow target clears and the shadow pass do not yet implement reversed
    // or logarithmic light depth. WebGL rasterization also requires a GL-range
    // light projection; WebGPU's depth shader handles either clip range.
    if (convention && (convention.mode !== "standard" || (convention.clipRange === "zero-to-one" && context.device.kind !== "webgpu"))) {
      throw new RenderDeviceError("This shadow pass cannot rasterize the requested light depth convention.", "SHADOW_DEPTH_CONVENTION_UNSUPPORTED", {
        backend: context.device.kind,
        mode: convention.mode,
        clipRange: convention.clipRange
      });
    }
    if (context.device.kind === "webgpu" && typeof context.device.getRenderTarget !== "function") {
      throw new RenderDeviceError("WebGPU shadow passes require render-target state restoration.", "SHADOW_TARGET_STATE_UNAVAILABLE");
    }

    const ownsFrame = context.device.captureState().get("frameActive") === false;
    if (ownsFrame) {
      context.device.beginFrame(context.width, context.height);
    }
    let prepared: PreparedDepthPlan | undefined;
    try {
      const pass = new DepthPass({
        casters: opaqueCasters,
        shaderLibrary: this.options.shaderLibrary,
        viewProjectionMatrix: this.options.viewProjectionMatrix,
        cameraPosition: this.options.cameraPosition,
        timeSeconds: this.options.timeSeconds,
        depthConvention: this.options.depthConvention,
        checkedSubmission: context.device.kind === "webgpu"
      });
      if (context.device.activeFrameToken === undefined) {
        // Third-party devices without frame identity keep the legacy immediate
        // path for unclipped casters; it cannot guarantee atomic preflight.
        pass.assertLegacyDepthFallback(context);
      } else {
        prepared = pass.prepare(context);
        pass.validatePrepared(context, prepared);
      }
      // Light depth is standard even inside a reversed or logarithmic camera
      // frame: the target clear and the receiver comparison both assume it.
      return withStandardDeviceDepth(context.device, () => this.executeWithinFrame(context, opaqueCasters, skippedTransparentCasters, pass, prepared));
    } finally {
      try {
        prepared?.dispose();
      } catch (error) {
        this.lastResult = null;
        throw error;
      } finally {
        if (ownsFrame) {
          try { context.device.endFrame(); }
          catch (error) { this.lastResult = null; throw error; }
        }
      }
    }
  }

  private executeWithinFrame(context: RenderPassContext, opaqueCasters: readonly RenderItem[], skippedTransparentCasters: number,
    pass: DepthPass, prepared: PreparedDepthPlan | undefined): ShadowPassResult {
    const target = this.ensureRenderTarget(context);
    this.sampleColorDepth = context.device.kind === "webgpu";
    if (this.sampleColorDepth && target.depthOnly) {
      throw new RenderDeviceError("WebGPU shadow receivers require a color attachment containing encoded depth.", "SHADOW_COLOR_ATTACHMENT_REQUIRED");
    }
    const checked = context.device.kind === "webgpu";
    const previousTarget = checked ? context.device.getRenderTarget!() : null;
    let completed = false;
    try {
      context.device.setRenderTarget(target);
      if (prepared) pass.validatePrepared(context, prepared);
      initializeShadowTarget(context, target);
      if (prepared) pass.executePrepared(context, prepared);
      else pass.execute(context);
      completed = true;
    } finally {
      // WebGL keeps its existing successful-pass target behavior. WebGPU
      // restores the caller even when a checked draw or target clear fails.
      if (checked || completed) context.device.setRenderTarget(previousTarget);
    }
    this.lastResult = {
      rendered: true,
      reason: "rendered",
      casterCount: opaqueCasters.length,
      skippedTransparentCasters,
      targetBacked: true,
      shadowTextureLabel: shadowTextureForTarget(target, this.sampleColorDepth).label,
      shadowTextureKind: !this.sampleColorDepth && target.depthTexture ? "depth-texture" : "encoded-color-depth",
      diagnostics: context.device.getDiagnostics()
    };
    return this.lastResult;
  }

  getLastResult(): ShadowPassResult | null {
    return this.lastResult;
  }

  getRenderTarget(): RenderTarget | null {
    return this.renderTarget;
  }

  getForwardShadowMap(options: Omit<ForwardShadowMapOptions, "texture" | "bias" | "filterKernel"> & {
    readonly bias?: number;
    readonly filterKernel?: ForwardShadowMapOptions["filterKernel"];
  }): ForwardShadowMapOptions | null {
    if (!this.renderTarget || !this.lastResult?.rendered) {
      return null;
    }
    if (this.options.depthConvention?.clipRange === "zero-to-one") {
      // Existing forward receivers map GL NDC depth to [0,1] themselves.
      throw new RenderDeviceError("The forward shadow receiver requires a minus-one-to-one light projection.", "SHADOW_RECEIVER_DEPTH_CONVENTION_UNSUPPORTED");
    }
    return {
      ...options,
      bias: options.bias ?? this.shadowMap.bias,
      filterKernel: options.filterKernel ?? this.shadowMap.filterKernel,
      texture: new TextureBinding({
        name: "u_shadowMapTexture",
        texture: shadowTextureForTarget(this.renderTarget, this.sampleColorDepth),
        sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
        required: true
      })
    };
  }

  dispose(): void {
    this.lastResult = null;
    // A caller-supplied target outlives this pass, so only dispose one we allocated ourselves.
    if (this.ownsRenderTarget) this.renderTarget?.dispose();
    this.renderTarget = null;
    this.ownsRenderTarget = false;
    this.shadowMap.dispose();
  }

  private ensureRenderTarget(context: RenderPassContext): RenderTarget {
    const supplied = this.options.renderTarget;
    if (supplied && !supplied.disposed && supplied.width === this.shadowMap.size && supplied.height === this.shadowMap.size) {
      if (this.ownsRenderTarget && this.renderTarget !== supplied) this.renderTarget?.dispose();
      this.renderTarget = supplied;
      this.ownsRenderTarget = false;
      return supplied;
    }
    if (this.renderTarget && !this.renderTarget.disposed && this.renderTarget.width === this.shadowMap.size && this.renderTarget.height === this.shadowMap.size) {
      return this.renderTarget;
    }
    if (this.ownsRenderTarget) this.renderTarget?.dispose();
    this.renderTarget = null;
    this.ownsRenderTarget = false;
    const depthTextures = context.device.info.capabilities?.includes("depth-textures") === true;
    // 02-T1946: under A3D_QR_LIGHTING a depth-texture shadow map is depth-only
    // (Q-01-5) — the rgba8 colour attachment was never sampled. Flag-off keeps
    // the legacy descriptor byte-for-byte.
    this.renderTarget = context.device.createRenderTarget(
      depthTextures && context.device.kind !== "webgpu" && rendererQrFlags(context.device).on("A3D_QR_LIGHTING")
        ? { width: this.shadowMap.size, height: this.shadowMap.size, label: `${this.shadowMap.texture.label}-depth`, depthOnly: true }
        : {
            width: this.shadowMap.size,
            height: this.shadowMap.size,
            label: `${this.shadowMap.texture.label}-depth-color`,
            format: "rgba8",
            depth: depthTextures ? "texture" : true
          }
    );
    this.ownsRenderTarget = true;
    return this.renderTarget;
  }

  private getSkipReason(): ShadowPassResult["reason"] | null {
    const light = this.options.light;
    if (!light) {
      return "no-light";
    }
    if (!isShadowLightVisible(light, this.options.visibilityRoot)) {
      return "light-disabled";
    }
    if (!light.castsShadow) {
      return "not-shadow-casting";
    }
    if (this.options.casters.length === 0) {
      return "no-casters";
    }
    return null;
  }
}

function shadowTextureForTarget(target: RenderTarget, sampleColorDepth: boolean) {
  // WebGPU's portable and native shadow receivers declare texture_2d<f32>.
  // A depth attachment cannot bind to that layout; all depth caster variants
  // also encode the same depth in the color attachment for this path.
  return sampleColorDepth ? target.colorTexture : target.depthTexture ?? target.colorTexture;
}

function initializeShadowTarget(context: RenderPassContext, target: RenderTarget): void {
  context.device.setRenderTarget(target);
  if (context.device.clearRenderTarget) {
    context.device.clearRenderTarget([1, 1, 1, 1]);
  } else {
    context.device.clear([1, 1, 1, 1]);
  }
}

function isTransparentCaster(caster: RenderItem): boolean {
  if (!caster.material) {
    return false;
  }
  const material = getBaseMaterial(caster.material);
  return material.renderState.blend;
}

function getBaseMaterial(material: Material | MaterialInstance): Material {
  return material instanceof MaterialInstance ? material.baseMaterial : material;
}
