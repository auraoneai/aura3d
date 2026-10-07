// PRD-04 §9.1 transmission capture contributor (P4-1). The contributor owns one
// lane resource: a mipmapped scene-colour copy that generated programs sample
// for KHR_materials_transmission/volume refraction.
//
// Behaviour (all behind A3D_QR_MATERIALS_TRANSMISSION on the registry):
//   - `passes("transmission", ctx)` returns one copy pass when any
//     `ctx.items` entry's material reports the transmission lobe; `[]`
//     otherwise (including on the Low tier — no target is allocated).
//   - Reads `aura.scene.color`, writes `prd04.transmission.color` (lane-named,
//     so no RenderGraph write conflict) and publishes the target on the
//     blackboard under `prd04.transmissionTarget`.
//   - Format: RGBA16F when `device.probe?.halfFloatColorBuffer`, else RGBA8
//     with issue `transmission-ldr-capture` (C-28). No readback: the copy is a
//     GPU-side fullscreen draw when the producer has published the
//     `aura.scene.color` RenderTarget on the blackboard.
//   - Scale: 0.5 on Medium, 1 on High/Ultra, none on Low (C-27 tier).
//
// Back-to-front transmissive ordering is the integrated-pass order (C-01 real);
// against the stub the contributor still captures and publishes — the lane
// scenes prove ordering standalone.

import { BaseRenderPass, type RenderPassContext } from "../RenderPass.js";
import {
  FRAME_RESOURCES,
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

/** The tier settings object carries no tier name — resolve by matching QUALITY_TIERS. */
function resolveTierName(tier: AuraQualityTierSettings): AuraQualityTier {
  for (const name of ["low", "medium", "high", "ultra"] as const) {
    if (tier === QUALITY_TIERS[name]) return name;
    if (JSON.stringify(tier) === JSON.stringify(QUALITY_TIERS[name])) return name;
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
const COPY_SHADER = {
  label: "a3d-prd04-transmission-copy",
  marker: "a3d_prd04_transmission_copy",
  vertex: `#version 300 es
// a3d_prd04_transmission_copy
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`,
  fragment: `#version 300 es
// a3d_prd04_transmission_copy
precision highp float;
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = texture(u_source, v_uv);
}
`
};

/**
 * GPU-side copy pass: draws `aura.scene.color` into the lane target with a
 * fullscreen triangle, then publishes the target on the blackboard. The mip
 * chain contract lives on `TransmissionRenderTarget` (the device allocates
 * mip storage when the target is sampled); no readback is performed (C-28).
 */
class TransmissionCapturePass extends BaseRenderPass {
  private buffer: RenderBuffer | null = null;
  private program: RenderShaderProgram | null = null;

  constructor(
    private readonly frame: FrameContributorContext,
    private readonly target: TransmissionRenderTarget,
    private readonly scale: number,
    private readonly format: "rgba16f" | "rgba8"
  ) {
    // §9.1 declares `reads: aura.scene.color`, but no graph pass writes it
    // until the C-01 producer lands (qr-request to:prd01) — declaring it now
    // makes compilePlan throw "no pass writes it" and takes the whole frame
    // down on flag-on runs. Ordering against the producer is re-declared as
    // `reads: [FRAME_RESOURCES.sceneColor]` the moment C-01 is real.
    super("prd04.transmission.capture", [], [TRANSMISSION_LANE_RESOURCE]);
  }

  execute(context: RenderPassContext): void {
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
      this.frame.blackboard.set(TRANSMISSION_BLACKBOARD_KEY, texture);
    }
    // The producer publishes the resolved RenderTarget under its resource name
    // once C-01 is real; on the stub path the copy is skipped (no readback
    // fallback — that would violate C-28 `readbacks === 0`).
    const source = this.frame.blackboard.get(FRAME_RESOURCES.sceneColor) as RenderTarget | undefined;
    let copied = false;
    if (source && texture) {
      this.ensureCopyResources(context.device);
      if (this.buffer && this.program) {
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
}

export class TransmissionFrameContributor implements FrameContributor {
  readonly id = "prd04.transmission";
  readonly owner = "prd04" as const;
  readonly flag = "A3D_QR_MATERIALS_TRANSMISSION" as const;
  readonly phases = [TRANSMISSION_PHASE] as const;
  private target: TransmissionRenderTarget | null = null;

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
    if (!this.target) {
      const format: "rgba16f" | "rgba8" = ctx.device.probe?.halfFloatColorBuffer ? "rgba16f" : "rgba8";
      this.target = new TransmissionRenderTarget(ctx.device, { width: 1, height: 1 }, { format });
    }
    const format: "rgba16f" | "rgba8" = ctx.device.probe?.halfFloatColorBuffer ? "rgba16f" : "rgba8";
    return [new TransmissionCapturePass(ctx, this.target, scale, format)];
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
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
