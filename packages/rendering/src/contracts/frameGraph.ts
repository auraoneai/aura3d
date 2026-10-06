/**
 * C-01 — frame graph phase hooks (CONTRACTS.md). Provider: PRD 01.
 * File: packages/rendering/src/contracts/frameGraph.ts.
 * Seam: packages/rendering/src/renderer/FrameGraph.ts (PR 0b).
 */

import type { RenderPass } from "../RenderPass";
import type { RenderItem } from "./renderItem";
import type { RenderSource } from "./renderSource";
import type { CameraLike } from "./frameUniforms";
import type { AuraQualityTierSettings } from "./quality";
import type { QrFlags, PrdId, QrFlagName, RegistryEntry } from "./core";
import type { RenderDevice } from "../RenderDevice";
import type { Texture } from "../Texture";

export type AuraFramePhase =
  | "collect"            // mutate/replace the item list before any GPU work (LOD, batching, interpolation, culling)
  | "shadows"            // shadow/depth work; may publish ShadowFrameUniforms
  | "background"         // sky/environment background draws (writes aura.scene.color before opaque)
  | "opaque"             // reserved: PRD 01 forward opaque
  | "after-opaque"       // scene depth copy, contact shadows, SSR inputs, scene-color copy
  | "transmission"       // PRD 04 transmission capture
  | "transparent"        // contributes TransparentQueueItems sorted with forward transparents
  | "after-transparent"  // decals/ribbons that must follow transparents
  | "post-hdr"           // linear-HDR passes before OutputPass (C-13 owns ordering inside this phase)
  | "output"             // reserved: PRD 01 OutputPass
  | "after-output";      // LDR overlays (debug views only); never used for look-affecting work

/** Well-known frame resource names (RenderGraph reads/writes). */
export const FRAME_RESOURCES: {
  readonly sceneColor: "aura.scene.color";        // RGBA16F linear HDR when A3D_QR_CORE=v2, else legacy target
  readonly sceneDepth: "aura.scene.depth";
  readonly sceneDepthCopy: "aura.scene.depth.copy";
  readonly sceneVelocity: "aura.scene.velocity";  // C-14
  readonly sceneReactive: "aura.scene.reactive";  // C-14
  readonly sceneColorCopy: "aura.scene.color.copy";
  readonly shadowMaps: "aura.shadow.maps";
  readonly output: "aura.output";
} = {
  sceneColor: "aura.scene.color",
  sceneDepth: "aura.scene.depth",
  sceneDepthCopy: "aura.scene.depth.copy",
  sceneVelocity: "aura.scene.velocity",
  sceneReactive: "aura.scene.reactive",
  sceneColorCopy: "aura.scene.color.copy",
  shadowMaps: "aura.shadow.maps",
  output: "aura.output"
};

export interface FrameCamera extends CameraLike {
  readonly viewMatrix: Float32Array;
  readonly projectionMatrix: Float32Array;
  readonly viewProjectionMatrix: Float32Array;
  readonly previousViewProjectionMatrix: Float32Array | null;
  readonly near: number;
  readonly far: number;
  readonly projection: "perspective" | "orthographic";
  readonly position: readonly [number, number, number];
}

export interface TransparentQueueItem {
  readonly sortDepth: number;             // view-space depth, larger = farther
  readonly order?: number;                // tie-break, lower first
  draw(ctx: FrameContributorContext): void;
}

export interface SceneDepthSource {         // C-07-IN-2
  readonly texture: Texture | null;
  readonly linearize: { readonly near: number; readonly far: number; readonly orthographic: boolean };
  readonly available: boolean;
}

export interface FrameContributorContext {
  readonly device: RenderDevice;
  readonly width: number;
  readonly height: number;
  readonly frameIndex: number;
  readonly timeSeconds: number;
  readonly camera: FrameCamera | null;
  readonly source: RenderSource;
  readonly items: readonly RenderItem[];
  readonly tier: AuraQualityTierSettings;
  readonly flags: QrFlags;
  readonly sceneDepth: SceneDepthSource;
  /** Publish/read cross-pass values (e.g. "shadow.frameUniforms"); keys namespaced "<prdNN>.<name>". */
  readonly blackboard: Map<string, unknown>;
}

export interface FrameContributor extends RegistryEntry {
  readonly id: string;                      // "<prdNN>.<name>", e.g. "prd07.particles"
  readonly owner: PrdId;
  readonly flag: QrFlagName;
  readonly phases: readonly AuraFramePhase[];
  readonly order?: number;
  collect?(items: RenderItem[], ctx: FrameContributorContext): RenderItem[];
  passes?(phase: AuraFramePhase, ctx: FrameContributorContext): readonly RenderPass[];
  transparentItems?(ctx: FrameContributorContext): readonly TransparentQueueItem[];
  dispose?(): void;
}

import { createRegistry } from "./core";

const frameContributorRegistry = createRegistry<FrameContributor>("frameContributors");

/** Reserved phases are owned by PRD 01 itself; anyone else registering for them throws FRAME_PHASE_RESERVED. */
const RESERVED_PHASES: readonly AuraFramePhase[] = ["opaque", "output"];

export function registerFrameContributor(contributor: FrameContributor): () => void {
  for (const phase of contributor.phases) {
    if (RESERVED_PHASES.includes(phase) && !contributor.id.startsWith("prd01.")) {
      throw new Error(`FRAME_PHASE_RESERVED:${phase}:${contributor.id}`);
    }
  }
  return frameContributorRegistry.register(contributor);
}

export function frameContributors(flags: QrFlags): readonly FrameContributor[] {
  return frameContributorRegistry.active(flags);
}
