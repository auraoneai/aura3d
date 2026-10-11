/**
 * Lane-01 row 01-S1 browser half (?tools=frame-graph): C-01 frame-graph
 * phases on a real WebGL2 frame (PRD-01 §16.2 "frame-graph.spec.ts (depth copy
 * visible in after-opaque)").
 *
 * A test contributor (`prd01.qr-depth-probe`, flag A3D_QR_CORE) registers for
 * `after-opaque`; its pass samples the published `aura.scene.depth.copy`
 * depth texture into an 8×8 probe target and reads it back. A box fills the
 * frame center over an empty background, so the center depth is < 1 and the
 * corner depth is the cleared far plane. With `a3d-qr=none` the contributor
 * must never be called.
 */

import { camera, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp } from "@aura3d/engine";
import {
  TextureBinding,
  type RenderDevice,
  type RenderTarget,
  type Texture,
  type UniformValue
} from "../../../../packages/rendering/src";
import { registerFrameContributor, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { RenderPass } from "../../../../packages/rendering/src/RenderPass";
import { errorText, fullscreenDraw, mountAura, OPAQUE_STATE, placeCanvas, settleAura, type FullscreenDraw } from "./specKit";

export interface FrameGraphReport {
  readonly flags: string;
  readonly afterOpaqueCalls: number;
  readonly sceneDepthAvailable: boolean;
  readonly depthCopyPublished: boolean;
  readonly forwardTargetPublished: boolean;
  /** Depth sampled from the copy, 0..255 (null when nothing ran). */
  readonly centerDepth: number | null;
  readonly cornerDepth: number | null;
  readonly drawCalls: number;
  readonly errors: readonly string[];
}

const PROBE_FRAGMENT = `uniform sampler2D u_depth;
out vec4 outColor;
void main() {
  float d = texture(u_depth, gl_FragCoord.xy / 8.0).r;
  outColor = vec4(d, d, d, 1.0);
}`;

export async function runFrameGraphTool(stage: HTMLElement): Promise<FrameGraphReport> {
  const flags = new URLSearchParams(window.location.search).get("a3d-qr") ?? "none";
  const errors: string[] = [];
  let calls = 0;
  let sceneDepthAvailable = false;
  let depthCopyPublished = false;
  let forwardTargetPublished = false;
  let centerDepth: number | null = null;
  let cornerDepth: number | null = null;
  let probe: { device: RenderDevice; target: RenderTarget; draw: FullscreenDraw } | null = null;

  const probePass = (ctx: FrameContributorContext): RenderPass => ({
    name: "prd01.qr-depth-probe",
    reads: [],
    writes: [],
    space: "linear-hdr",
    execute: () => {
      const copy = ctx.blackboard.get("aura.scene.depth.copy") as RenderTarget | undefined;
      const texture = (copy?.depthTexture ?? null) as Texture | null;
      if (!texture) return;
      if (!probe || probe.device !== ctx.device) {
        const target = ctx.device.createRenderTarget({ width: 8, height: 8, label: "qr-depth-probe" });
        probe = { device: ctx.device, target, draw: fullscreenDraw(ctx.device, "qr-depth-probe", PROBE_FRAGMENT) };
      }
      const previous = ctx.device.getRenderTarget?.() ?? null;
      ctx.device.setRenderTarget(probe.target);
      probe.draw.draw(OPAQUE_STATE, new Map<string, UniformValue>([["u_depth", new TextureBinding({ name: "u_depth", texture, required: true })]]));
      centerDepth = ctx.device.readPixels(4, 4, 1, 1)[0] ?? null;
      cornerDepth = ctx.device.readPixels(0, 0, 1, 1)[0] ?? null;
      ctx.device.setRenderTarget(previous);
    }
  });

  const unregister = registerFrameContributor({
    id: "prd01.qr-depth-probe",
    owner: "prd01",
    flag: "A3D_QR_CORE",
    phases: ["after-opaque"],
    passes: (phase, ctx) => {
      if (phase !== "after-opaque") return [];
      calls += 1;
      sceneDepthAvailable = ctx.sceneDepth.available;
      depthCopyPublished = ctx.blackboard.has("aura.scene.depth.copy");
      forwardTargetPublished = ctx.blackboard.has("prd01.forwardTarget");
      return [probePass(ctx)];
    }
  });

  let app: AuraApp | null = null;
  try {
    const snapshot = scene()
      .background("#000000")
      .camera(camera.perspective({ fov: 50, position: [0, 0, 3], target: [0, 0, 0] }))
      .add(primitives.box({ name: "depth-box", material: material.pbr({ color: "#bbbbbb", roughness: 0.6 }), size: [0.9, 0.9, 0.9] }))
      .add(lights.directional({ position: [2, 3, 4], intensity: 2 }))
      .toJSON();
    app = await mountAura(placeCanvas(stage, 0, 0, 256, 256, "qr-frame-graph"), snapshot);
    await settleAura(app, 6);
  } catch (error) {
    errors.push(errorText(error));
  } finally {
    unregister();
  }

  const report: FrameGraphReport = {
    flags,
    afterOpaqueCalls: calls,
    sceneDepthAvailable,
    depthCopyPublished,
    forwardTargetPublished,
    centerDepth,
    cornerDepth,
    drawCalls: app?.diagnostics().drawCalls ?? 0,
    errors: [...errors, ...(app?.diagnostics().errors ?? [])]
  };
  window.__QR_SPEC__ = report;
  return report;
}
