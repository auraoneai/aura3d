/**
 * Renderer-owned opaque-color capture for physical transmission.
 *
 * A frame copies its own linear scene target before transmissive draws, then
 * generates the complete mip chain. Only the successfully submitted result is
 * published to that frame's blackboard. Resources are retained per device,
 * renderer scope and view, and are retired on resize, view removal or loss.
 */
import { BaseRenderPass, type RenderPassContext } from "../RenderPass.js";
import { type FrameContributor, type FrameContributorContext, registerFrameContributor } from "../contracts/frameGraph.js";
import { QUALITY_TIERS, type AuraQualityTier, type AuraQualityTierSettings } from "../contracts/quality.js";
import { RenderDeviceError, type DrawCommand, type RenderBuffer, type RenderDevice, type RenderShaderProgram, type RenderTarget, type UniformValue } from "../RenderDevice.js";
import { TextureBinding } from "../TextureBinding.js";
import { TransmissionRenderTarget } from "../TransmissionRenderTarget.js";
import {
  TRANSMISSION_BLACKBOARD_KEY,
  clearCapturedTransmissionTarget,
  itemReportsTransmissionLobe,
  markTrustedTransmissionCapturePass,
  publishCapturedTransmissionTarget,
  registerTransmissionLifecycle,
  revokeTransmissionCapture,
  setPrd04TransmissionDiagnostics,
  validTransmissionFrameIdentity,
  type Prd04TransmissionDiagnostics,
  type CapturedTransmissionTarget
} from "./transmissionTargetStore.js";
import { PRD01_FORWARD_TARGET } from "../renderer/FrameGraph.js";
import { qrCoreOutputOn } from "../renderer/qrSubFlags.js";
import {
  TRANSMISSION_COPY_FRAGMENT,
  TRANSMISSION_COPY_MARKER,
  TRANSMISSION_COPY_VERTEX
} from "../shaders/physical/transmission_copy.glsl.js";
import {
  TRANSMISSION_COPY_WGSL_FRAGMENT,
  TRANSMISSION_COPY_WGSL_VERTEX
} from "../shaders/physical/transmission_copy.wgsl.js";

export { TRANSMISSION_BLACKBOARD_KEY };
export { itemReportsTransmissionLobe, prd04TransmissionDiagnostics, type Prd04TransmissionDiagnostics } from "./transmissionTargetStore.js";
export const TRANSMISSION_PHASE = "transmission" as const;
export const TRANSMISSION_LANE_RESOURCE = "prd04.transmission.color";

const TRANSMISSION_TIER_SCALE: Readonly<Record<AuraQualityTier, number | null>> = {
  low: null,
  medium: 0.5,
  high: 1,
  ultra: 1
};

function tierSettingsEqual(a: AuraQualityTierSettings, b: AuraQualityTierSettings): boolean {
  for (const key of Object.keys(a) as (keyof AuraQualityTierSettings)[]) {
    if (key === "shadow") {
      const sa = a.shadow, sb = b.shadow;
      if (sa.mapSize !== sb.mapSize || sa.cascades !== sb.cascades || sa.filter !== sb.filter
        || sa.localShadowLights !== sb.localShadowLights || sa.contact !== sb.contact) return false;
    } else if (key === "froxelGrid") {
      const ga = a.froxelGrid, gb = b.froxelGrid;
      if ((ga === null) !== (gb === null)) return false;
      if (ga && gb && (ga[0] !== gb[0] || ga[1] !== gb[1] || ga[2] !== gb[2])) return false;
    } else if (a[key] !== b[key]) return false;
  }
  return true;
}

function resolveTierName(tier: AuraQualityTierSettings): AuraQualityTier {
  for (const name of ["low", "medium", "high", "ultra"] as const) {
    if (tier === QUALITY_TIERS[name] || tierSettingsEqual(tier, QUALITY_TIERS[name])) return name;
  }
  return "high";
}

type CaptureFormat = "rgba16f" | "rgba32f" | "rgba8";
const INACTIVE_DIAGNOSTICS: Prd04TransmissionDiagnostics = {
  targetActive: false, format: null, mipCount: 0, scale: null, sourceCopied: false, readbacks: 0, issues: []
};

const COPY_SHADER = {
  label: "a3d-prd04-transmission-copy",
  marker: TRANSMISSION_COPY_MARKER,
  vertex: TRANSMISSION_COPY_VERTEX,
  fragment: TRANSMISSION_COPY_FRAGMENT,
  webgpu: { vertex: TRANSMISSION_COPY_WGSL_VERTEX, fragment: TRANSMISSION_COPY_WGSL_FRAGMENT },
  portableBindings: [{ name: "u_source", kind: "texture2d", required: true }] as const
};

interface TransmissionViewState {
  readonly generation: number;
  target?: TransmissionRenderTarget;
  format?: CaptureFormat;
  buffer?: RenderBuffer;
  program?: RenderShaderProgram;
  capture?: CapturedTransmissionTarget;
}

interface TransmissionDeviceState {
  readonly generation: number;
  readonly scopes: Map<object, Map<string | number, TransmissionViewState>>;
  unsubscribe?: () => void;
}

function disposeView(state: TransmissionViewState): void {
  revokeTransmissionCapture(state.capture);
  state.capture = undefined;
  const errors: unknown[] = [];
  for (const resource of [state.buffer, state.program, state.target]) {
    try { resource?.dispose(); } catch (error) { errors.push(error); }
  }
  state.buffer = undefined;
  state.program = undefined;
  state.target = undefined;
  state.format = undefined;
  if (errors.length) throw new AggregateError(errors, "Transmission view disposal failed");
}

class TransmissionCapturePass extends BaseRenderPass {
  constructor(
    private readonly frame: FrameContributorContext,
    private readonly state: TransmissionViewState,
    private readonly scale: number,
    reads: readonly string[]
  ) {
    super("prd04.transmission.capture", reads, [TRANSMISSION_LANE_RESOURCE]);
    markTrustedTransmissionCapturePass(this);
  }

  execute(context: RenderPassContext): void {
    const frame = this.frame, device = frame.device;
    clearCapturedTransmissionTarget(frame);
    revokeTransmissionCapture(this.state.capture);
    this.state.capture = undefined;
    let format: CaptureFormat | null = null;
    let copied = false;
    const issues: string[] = [];
    try {
      if (context.device !== device || device.disposed || device.contextLost ||
          (device.generation ?? 0) !== this.state.generation) {
        throw new RenderDeviceError("Transmission frame device is unavailable or changed", "TRANSMISSION_DEVICE_UNAVAILABLE");
      }
      if (!validTransmissionFrameIdentity(frame)) {
        throw new RenderDeviceError("Transmission capture requires renderer, view and frame identity", "TRANSMISSION_FRAME_IDENTITY_REQUIRED");
      }
      const source = frame.blackboard.get(PRD01_FORWARD_TARGET) as RenderTarget | undefined;
      if (!source || source.disposed || source.colorTexture.disposed || source.depthOnly ||
          source.colorTexture.dimension !== "2d" || !source.colorTexture.usage.includes("sampled")) {
        throw new RenderDeviceError("Transmission requires a live opaque scene-color target", "TRANSMISSION_SOURCE_UNAVAILABLE");
      }
      if (frame.blackboard.get("prd01.outputColorSpace") !== "linear" || source.colorTexture.colorSpace !== "linear") {
        throw new RenderDeviceError("Transmission requires linear scene-color input", "TRANSMISSION_SOURCE_NOT_LINEAR");
      }
      const sourceFormat = source.colorTexture.format;
      if (sourceFormat !== "rgba8" && sourceFormat !== "rgba16f" && sourceFormat !== "rgba32f") {
        throw new RenderDeviceError("Transmission scene-color format is unsupported", "TRANSMISSION_SOURCE_FORMAT_UNSUPPORTED", { format: sourceFormat });
      }
      format = sourceFormat;
      if (format === "rgba8") issues.push("transmission-ldr-capture");
      if (!device.getRenderTarget || !device.drawTransmissionCapture) {
        throw new RenderDeviceError("Device cannot verify a transmission copy", "TRANSMISSION_COPY_UNSUPPORTED", { backend: device.kind });
      }
      const previous = device.getRenderTarget();
      if (previous !== source) {
        throw new RenderDeviceError("The opaque scene target is not currently bound", "TRANSMISSION_SOURCE_NOT_BOUND");
      }
      const width = Math.max(1, Math.round(source.width * this.scale));
      const height = Math.max(1, Math.round(source.height * this.scale));
      if (!this.state.target || this.state.format !== format) {
        const next = new TransmissionRenderTarget(device, { width, height }, { format });
        const previousTarget = this.state.target;
        this.state.target = next;
        this.state.format = format;
        previousTarget?.dispose();
      } else {
        this.state.target.resize(width, height);
      }
      const target = this.state.target.texture;
      if (!target) throw new RenderDeviceError("Transmission target is unavailable", "TRANSMISSION_TARGET_UNAVAILABLE");
      if (!this.state.buffer) this.state.buffer = device.createBuffer("vertex", 3 * 2 * 4, new Float32Array(6));
      if (!this.state.program) this.state.program = device.createShaderProgram(COPY_SHADER);
      const command: DrawCommand = {
        label: "prd04-transmission-scene-color-copy",
        topology: "triangles",
        vertexBuffer: this.state.buffer,
        vertexCount: 3,
        shader: this.state.program,
        renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" },
        uniforms: new Map<string, UniformValue>([
          ["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture, required: true })]
        ])
      };
      try {
        // Switching away resolves WebGL multisampled scene targets before sampling.
        device.setRenderTarget(target);
        device.drawTransmissionCapture(command);
        copied = true;
      } finally {
        device.setRenderTarget(previous);
      }
      const mipCount = this.state.target.mipCount;
      if (mipCount > 1) {
        if (!device.generateRenderTargetMipmaps) {
          throw new RenderDeviceError("Device cannot generate the transmission mip chain", "TRANSMISSION_MIP_GENERATION_UNAVAILABLE");
        }
        device.generateRenderTargetMipmaps(target);
      }
      this.state.capture = publishCapturedTransmissionTarget(frame, target, mipCount);
      setPrd04TransmissionDiagnostics(frame, {
        targetActive: true, format, mipCount, scale: this.scale, sourceCopied: true, readbacks: 0, issues
      } satisfies Prd04TransmissionDiagnostics);
    } catch (error) {
      clearCapturedTransmissionTarget(frame);
      revokeTransmissionCapture(this.state.capture);
      this.state.capture = undefined;
      const code = error instanceof RenderDeviceError ? error.code : "transmission-capture-failed";
      setPrd04TransmissionDiagnostics(frame, {
        targetActive: false, format, mipCount: 0, scale: this.scale, sourceCopied: copied, readbacks: 0, issues: [...issues, code]
      } satisfies Prd04TransmissionDiagnostics);
      throw error;
    }
  }
}

export class TransmissionFrameContributor implements FrameContributor {
  readonly id = "prd04.transmission";
  readonly owner = "prd04" as const;
  readonly flag = "A3D_QR_MATERIALS_TRANSMISSION" as const;
  readonly phases = [TRANSMISSION_PHASE] as const;
  private readonly devices = new Map<RenderDevice, TransmissionDeviceState>();

  passes(phase: string, ctx: FrameContributorContext): readonly TransmissionCapturePass[] {
    if (phase !== TRANSMISSION_PHASE) return [];
    clearCapturedTransmissionTarget(ctx);
    setPrd04TransmissionDiagnostics(ctx, INACTIVE_DIAGNOSTICS);
    const scope = ctx.postScopeId, view = ctx.viewId;
    const existing = scope && view !== undefined ? this.devices.get(ctx.device)?.scopes.get(scope)?.get(view) : undefined;
    revokeTransmissionCapture(existing?.capture);
    if (existing) existing.capture = undefined;
    if (ctx.blackboard.get("prd01.transmissionCapturePlanned") === false) return [];
    const scale = TRANSMISSION_TIER_SCALE[resolveTierName(ctx.tier)];
    if (scale === null || scale === undefined || !ctx.items.some(itemReportsTransmissionLobe)) return [];
    if (!validTransmissionFrameIdentity(ctx) || !scope || view === undefined) {
      throw new RenderDeviceError("Transmission capture requires renderer and view identity", "TRANSMISSION_FRAME_IDENTITY_REQUIRED");
    }
    const generation = ctx.device.generation ?? 0;
    let deviceState = this.devices.get(ctx.device);
    if (deviceState && deviceState.generation !== generation) {
      this.releaseDevice(ctx.device);
      deviceState = undefined;
    }
    if (!deviceState) {
      deviceState = { generation, scopes: new Map() };
      this.devices.set(ctx.device, deviceState);
      deviceState.unsubscribe = ctx.device.onDeviceLost?.(() => {
        try { this.releaseDevice(ctx.device); } catch { /* Continue device-loss notifications. */ }
      });
    }
    let views = deviceState.scopes.get(scope);
    if (!views) {
      views = new Map();
      deviceState.scopes.set(scope, views);
    }
    let state = views.get(view);
    if (!state) {
      state = { generation };
      views.set(view, state);
    }
    const declaredOpaqueResource = ctx.blackboard.get("prd01.opaqueColorResource");
    const sourceResource = typeof declaredOpaqueResource === "string" && declaredOpaqueResource.trim()
      ? declaredOpaqueResource
      : qrCoreOutputOn(ctx.flags) ? "aura.scene.color.opaque" : "color";
    return [new TransmissionCapturePass(ctx, state, scale, [sourceResource])];
  }

  releaseView(device: RenderDevice, scope: object, view: string | number): void {
    const state = this.devices.get(device), views = state?.scopes.get(scope), entry = views?.get(view);
    if (!state || !views || !entry) return;
    views.delete(view);
    if (views.size === 0) state.scopes.delete(scope);
    try { disposeView(entry); } finally {
      if (state.scopes.size === 0) this.releaseDevice(device);
    }
  }

  releaseScope(device: RenderDevice, scope: object): void {
    const state = this.devices.get(device), views = state?.scopes.get(scope);
    if (!state || !views) return;
    state.scopes.delete(scope);
    const errors: unknown[] = [];
    for (const entry of views.values()) {
      try { disposeView(entry); } catch (error) { errors.push(error); }
    }
    if (state.scopes.size === 0) {
      try { this.releaseDevice(device); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Transmission scope disposal failed");
  }

  private releaseDevice(device: RenderDevice): void {
    const state = this.devices.get(device);
    if (!state) return;
    this.devices.delete(device);
    state.unsubscribe?.();
    const errors: unknown[] = [];
    for (const views of state.scopes.values()) for (const entry of views.values()) {
      try { disposeView(entry); } catch (error) { errors.push(error); }
    }
    state.scopes.clear();
    if (errors.length) throw new AggregateError(errors, "Transmission device disposal failed");
  }

  dispose(): void {
    const errors: unknown[] = [];
    for (const device of [...this.devices.keys()]) {
      try { this.releaseDevice(device); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Transmission contributor disposal failed");
  }
}

export const transmissionFrameContributor = new TransmissionFrameContributor();
registerTransmissionLifecycle({
  releaseView: (device, scope, view) => transmissionFrameContributor.releaseView(device, scope, view),
  releaseScope: (device, scope) => transmissionFrameContributor.releaseScope(device, scope)
});

let contributorRegistered = false;
export function registerPrd04TransmissionContributor(): void {
  if (contributorRegistered) return;
  contributorRegistered = true;
  registerFrameContributor(transmissionFrameContributor);
}
