// PRD-04 §9.1 transmission capture contributor (P4-1). The contributor owns one
// lane resource: a mipmapped scene-colour copy that generated programs sample
// for KHR_materials_transmission/volume refraction.
//
// Behaviour (all behind A3D_QR_MATERIALS_TRANSMISSION on the registry):
//   - `passes("transmission", ctx)` returns one copy pass when any
//     `ctx.items` entry's material reports the transmission lobe; `[]`
//     otherwise (including on the Low tier — no target is allocated).
//   - Reads the produced colour resource (`aura.scene.color.opaque` on the v2
//     path, `color` on the legacy path — T0-18(c)), writes
//     `prd04.transmission.color` (lane-named, so no RenderGraph write
//     conflict) and publishes the target on the blackboard under
//     `prd04.transmissionTarget`.
//   - Format: RGBA16F when `device.probe?.halfFloatColorBuffer`, else RGBA8
//     with issue `transmission-ldr-capture` (C-28). No readback: the copy is a
//     GPU-side fullscreen draw sourcing the `prd01.forwardTarget` RenderTarget
//     published on the blackboard.
//   - Scale: 0.5 on Medium, 1 on High/Ultra, none on Low (C-27 tier).
//
// Back-to-front transmissive ordering is the integrated-pass order (C-01 real);
// against the stub the contributor still captures and publishes — the lane
// scenes prove ordering standalone.

import { BaseRenderPass, type RenderPassContext } from "../RenderPass.js";
import {
  type FrameContributor,
  type FrameContributorContext
} from "../contracts/frameGraph.js";
import type { RenderItem } from "../contracts/renderItem.js";
import { QUALITY_TIERS, type AuraQualityTier, type AuraQualityTierSettings } from "../contracts/quality.js";
import type { RenderBuffer, RenderDevice, RenderShaderProgram, RenderTarget, UniformValue } from "../RenderDevice.js";
import { registerFrameContributor } from "../contracts/frameGraph.js";
import { TextureBinding } from "../TextureBinding.js";
import { MaterialInstance } from "../MaterialInstance.js";
import { TransmissionRenderTarget } from "../TransmissionRenderTarget.js";
import { PRD01_FORWARD_TARGET } from "../renderer/FrameGraph.js";
import { qrCoreOutputOn } from "../renderer/qrSubFlags.js";
import {
  TRANSMISSION_COPY_FRAGMENT,
  TRANSMISSION_COPY_MARKER,
  TRANSMISSION_COPY_VERTEX
} from "../shaders/physical/transmission_copy.glsl.js";

export const TRANSMISSION_PHASE = "transmission" as const;
export const TRANSMISSION_BLACKBOARD_KEY = "prd04.transmissionTarget";
export const TRANSMISSION_LANE_RESOURCE = "prd04.transmission.color";

/** Scale of the capture relative to the frame buffer, per C-27 tier (`none` on Low). */
const TRANSMISSION_TIER_SCALE: Readonly<Record<AuraQualityTier, number | null>> = {
  low: null,
  medium: 0.5,
  high: 1,
  ultra: 1
};

/**
 * The tier settings object carries no tier name — resolve by matching
 * QUALITY_TIERS. Field comparison (no JSON.stringify): `resolveTierSettings`
 * returns fresh objects, so identity alone misses override-free copies.
 */
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
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function resolveTierName(tier: AuraQualityTierSettings): AuraQualityTier {
  for (const name of ["low", "medium", "high", "ultra"] as const) {
    if (tier === QUALITY_TIERS[name] || tierSettingsEqual(tier, QUALITY_TIERS[name])) return name;
  }
  return "high";
}

function numericParameter(material: { getParameter(name: string): unknown }, name: string): number {
  const value = material.getParameter(name);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Same predicate ForwardPass uses for the transmissive queue (blend materials never count). */
export function itemReportsTransmissionLobe(item: RenderItem): boolean {
  const material = item.material;
  if (!material) return false;
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  if (!base) return false;
  if (base.renderState?.blend) return false;
  return numericParameter(base, "u_transmissionFactor") > 0.001
    || numericParameter(base, "u_diffuseTransmissionFactor") > 0.001
    || numericParameter(base, "u_volumeThicknessFactor") > 0.001;
}

export interface Prd04TransmissionDiagnostics {
  readonly targetActive: boolean;
  readonly format: "rgba16f" | "rgba8" | null;
  readonly mipCount: number;
  readonly scale: number | null;
  readonly sourceCopied: boolean;
  /** C-28: texture readbacks performed by the capture pass (must stay 0). */
  readonly readbacks: number;
  readonly issues: readonly string[];
}

const INACTIVE_DIAGNOSTICS: Prd04TransmissionDiagnostics = {
  targetActive: false,
  format: null,
  mipCount: 0,
  scale: null,
  sourceCopied: false,
  readbacks: 0,
  issues: []
};

let lastDiagnostics: Prd04TransmissionDiagnostics = INACTIVE_DIAGNOSTICS;

/** Observed state for the C-31 `materials` diagnostics section. */
export function prd04TransmissionDiagnostics(): Prd04TransmissionDiagnostics {
  return { ...lastDiagnostics, issues: [...lastDiagnostics.issues] };
}

// The device requires `marker` to appear verbatim in both GLSL stages.
// GLSL lives in `shaders/physical/transmission_copy.glsl.ts` (glsl-location
// arch-gate allows `#version` strings only in chunk/post/output locations).
const COPY_SHADER = {
  label: "a3d-prd04-transmission-copy",
  marker: TRANSMISSION_COPY_MARKER,
  vertex: TRANSMISSION_COPY_VERTEX,
  fragment: TRANSMISSION_COPY_FRAGMENT
};

/**
 * GPU-side copy pass: draws the resolved scene colour into the lane target
 * with a fullscreen triangle, then publishes the target on the blackboard.
 * The mip chain contract lives on `TransmissionRenderTarget` (the device
 * allocates mip storage when the target is sampled); no readback is
 * performed (C-28).
 *
 * The pass instance is cached per device by the contributor (T0-18e): the
 * copy vertex buffer and shader program are allocated once in
 * `ensureCopyResources` instead of leaking one pair per frame. `configure`
 * re-points the pass at the current contributor context before the graph
 * executes it.
 */
class TransmissionCapturePass extends BaseRenderPass {
  private buffer: RenderBuffer | null = null;
  private program: RenderShaderProgram | null = null;
  private frame: FrameContributorContext | null = null;
  private scale = 1;

  constructor(
    private readonly target: TransmissionRenderTarget,
    private readonly format: "rgba16f" | "rgba8",
    reads: readonly string[]
  ) {
    // T0-18(c): the copy reads the colour resource the graph actually
    // produces — `aura.scene.color.opaque` on the v2 path (written by
    // `prd01.opaque`, before `prd01.transmission` draws transmissives on top)
    // or `color` on the legacy path. Declaring `reads: []` hid the ordering
    // and let the copy run against an unproduced target.
    super("prd04.transmission.capture", reads, [TRANSMISSION_LANE_RESOURCE]);
  }

  /** Re-point at this frame's contributor context + scale (one pass per device/mode). */
  configure(frame: FrameContributorContext, scale: number): void {
    this.frame = frame;
    this.scale = scale;
  }

  execute(context: RenderPassContext): void {
    if (!this.frame) return;
    const frame = this.frame;
    const width = Math.max(1, Math.round(context.width * this.scale));
    const height = Math.max(1, Math.round(context.height * this.scale));
    this.target.resize(width, height);
    const texture = this.target.texture;
    const issues: string[] = [];
    if (this.format === "rgba8") {
      // C-28: no half-float color buffer → the capture degrades to LDR.
      issues.push("transmission-ldr-capture");
    }
    if (texture) {
      frame.blackboard.set(TRANSMISSION_BLACKBOARD_KEY, texture);
    }
    // The producer publishes its RenderTarget under PRD01_FORWARD_TARGET once
    // the forward target exists (HDR path and postprocess path both do); on
    // paths without one the copy is skipped (no readback fallback — that
    // would violate C-28 `readbacks === 0`).
    const source = frame.blackboard.get(PRD01_FORWARD_TARGET) as RenderTarget | undefined;
    let copied = false;
    if (source && texture) {
      this.ensureCopyResources(context.device);
      if (this.buffer && this.program) {
        // T0-18(d): restore the bound target — the forward target must still
        // be bound when the transmissive forward pass runs after us.
        const previous = context.device.getRenderTarget?.() ?? null;
        context.device.setRenderTarget(texture);
        context.device.draw({
          label: "prd04-transmission-scene-color-copy",
          topology: "triangles",
          vertexBuffer: this.buffer,
          vertexCount: 3,
          shader: this.program,
          uniforms: new Map<string, UniformValue>([
            ["u_source", new TextureBinding({ name: "u_source", texture: source.colorTexture })]
          ])
        });
        context.device.setRenderTarget(previous);
        copied = true;
      }
    }
    lastDiagnostics = {
      targetActive: texture !== undefined,
      format: this.format,
      mipCount: this.target.mipCount,
      scale: this.scale,
      sourceCopied: copied,
      // The copy is device-to-device (setRenderTarget + draw); no readPixels
      // or mapped-readback call exists on this path (C-28).
      readbacks: 0,
      issues
    };
  }

  private ensureCopyResources(device: RenderDevice): void {
    if (!this.buffer) {
      this.buffer = device.createBuffer("vertex", 3 * 2 * 4, new Float32Array(6));
    }
    if (!this.program) {
      this.program = device.createShaderProgram(COPY_SHADER);
    }
  }

  dispose(): void {
    this.buffer?.dispose();
    this.buffer = null;
    this.program?.dispose();
    this.program = null;
  }
}

/**
 * T0-18(e): GPU state is per-device — the module-singleton contributor keeps a
 * `Map<RenderDevice, …>` of `{target, passes}` instead of one shared target
 * (which leaked across renderers) and one fresh pass per frame (which leaked a
 * copy VB/program pair every execute).
 */
interface TransmissionDeviceState {
  readonly target: TransmissionRenderTarget;
  readonly format: "rgba16f" | "rgba8";
  readonly passes: { v2?: TransmissionCapturePass; legacy?: TransmissionCapturePass };
}

/** Colour resource written by the v2 `prd01.opaque` ForwardPass (Renderer.ts). */
const V2_OPAQUE_COLOR_RESOURCE = "aura.scene.color.opaque";
/** Colour resource written by the legacy-path ForwardPass default (`writes: ["color"]`). */
const LEGACY_COLOR_RESOURCE = "color";

export class TransmissionFrameContributor implements FrameContributor {
  readonly id = "prd04.transmission";
  readonly owner = "prd04" as const;
  readonly flag = "A3D_QR_MATERIALS_TRANSMISSION" as const;
  readonly phases = [TRANSMISSION_PHASE] as const;
  private readonly devices = new Map<RenderDevice, TransmissionDeviceState>();

  passes(phase: string, ctx: FrameContributorContext): readonly TransmissionCapturePass[] {
    if (phase !== TRANSMISSION_PHASE) return [];
    const scale = TRANSMISSION_TIER_SCALE[resolveTierName(ctx.tier)];
    if (scale === null || scale === undefined) {
      lastDiagnostics = INACTIVE_DIAGNOSTICS;
      return [];
    }
    if (!ctx.items.some(itemReportsTransmissionLobe)) {
      lastDiagnostics = INACTIVE_DIAGNOSTICS;
      return [];
    }
    let state = this.devices.get(ctx.device);
    if (!state) {
      const format: "rgba16f" | "rgba8" = ctx.device.probe?.halfFloatColorBuffer ? "rgba16f" : "rgba8";
      state = {
        target: new TransmissionRenderTarget(ctx.device, { width: 1, height: 1 }, { format }),
        format,
        passes: {}
      };
      this.devices.set(ctx.device, state);
    }
    // v2 graphs order the capture after `aura.scene.color.opaque`; legacy
    // graphs after `color` (the ForwardPass default write). Both are produced
    // by passes that exist on every graph that runs this phase.
    const v2 = ctx.flags !== undefined && qrCoreOutputOn(ctx.flags);
    const key = v2 ? "v2" : "legacy";
    let pass = state.passes[key];
    if (!pass) {
      pass = new TransmissionCapturePass(
        state.target,
        state.format,
        [v2 ? V2_OPAQUE_COLOR_RESOURCE : LEGACY_COLOR_RESOURCE]
      );
      state.passes[key] = pass;
    }
    pass.configure(ctx, scale);
    return [pass];
  }

  dispose(): void {
    for (const state of this.devices.values()) {
      state.passes.v2?.dispose();
      state.passes.legacy?.dispose();
      state.target.dispose();
    }
    this.devices.clear();
    lastDiagnostics = INACTIVE_DIAGNOSTICS;
  }
}

export const transmissionFrameContributor: FrameContributor = new TransmissionFrameContributor();

let contributorRegistered = false;

/** Idempotent registration for the lane barrel (import-time). */
export function registerPrd04TransmissionContributor(): void {
  if (contributorRegistered) return;
  contributorRegistered = true;
  registerFrameContributor(transmissionFrameContributor);
}
