// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraSceneNode, AuraPhysicsWorldController, AuraCameraSpec, AuraCameraFrameAssetOptions, AuraTimelineSpec, AuraSceneSnapshot } from "./types.js";
import { AURA_NORMALIZED_MODEL_MAX_DIMENSION, boundsFromAsset, boundsHeight, boundsMaxDimension, boundsSize } from "../SceneGroundingUtils.js";
import { AuraNodeBuilder } from "./builder.js";
import { camera } from "./camera.js";
import { isPositiveFinite } from "../sceneMath.js";
import { physics } from "./physics.js";
import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import { timeline } from "./timeline.js";

export function resolveFrameAssetRenderScale(bounds: ReturnType<typeof boundsFromAsset>, options: AuraCameraFrameAssetOptions): number {
  const size = boundsSize(bounds);
  const height = Math.max(0.001, boundsHeight(bounds));
  const horizontalLength = Math.max(0.001, size[0], size[2]);
  const maxDimension = Math.max(0.001, boundsMaxDimension(bounds));
  if (isPositiveFinite(options.targetHeight)) return options.targetHeight / height;
  if (isPositiveFinite(options.targetLength)) return options.targetLength / horizontalLength;
  if (isPositiveFinite(options.targetMaxDimension)) return options.targetMaxDimension / maxDimension;
  return AURA_NORMALIZED_MODEL_MAX_DIMENSION / maxDimension;
}

export class AuraSceneBuilder {
  private readonly nodes: AuraSceneNode[] = [];
  private backgroundColor: AuraColor = "#070b12";
  private cameraSpec: AuraCameraSpec = camera.orbit();
  private timelineSpec: AuraTimelineSpec | undefined;
  private physicsController: AuraPhysicsWorldController | undefined;
  private diagnosticsEnabled = false;

  background(color: AuraColor): this {
    this.backgroundColor = color;
    return this;
  }

  add(node: AuraNodeBuilder<AuraSceneNode> | AuraSceneNode): this {
    this.nodes.push(node instanceof AuraNodeBuilder ? node.toJSON() : node);
    return this;
  }

  addMany(nodes: readonly (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[]): this {
    for (const node of nodes) this.add(node);
    return this;
  }

  camera(next: AuraCameraSpec): this {
    resolveCameraClipping(next);
    this.cameraSpec = next;
    return this;
  }

  timeline(next: AuraTimelineSpec): this {
    this.timelineSpec = next;
    return this;
  }

  physics(next: AuraPhysicsWorldController): this {
    this.physicsController = next;
    return this;
  }

  diagnostics(enabled = true): this {
    this.diagnosticsEnabled = enabled;
    return this;
  }

  toJSON(): AuraSceneSnapshot {
    return {
      schema: "aura3d-scene-snapshot/1.0",
      background: this.backgroundColor,
      camera: this.cameraSpec,
      timeline: this.timelineSpec,
      physics: this.physicsController?.snapshot(),
      nodes: [...this.nodes],
      diagnostics: {
        enabled: this.diagnosticsEnabled
      }
    };
  }

  getPhysicsController(): AuraPhysicsWorldController | undefined {
    return this.physicsController;
  }
}

export function scene(): AuraSceneBuilder {
  return new AuraSceneBuilder();
}
