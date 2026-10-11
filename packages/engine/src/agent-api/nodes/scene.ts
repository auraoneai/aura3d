// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraSceneNode, AuraPhysicsWorldController, AuraCameraSpec, AuraCameraFrameAssetOptions, AuraTimelineSpec, AuraSceneSnapshot } from "./types.js";
import { AURA_NORMALIZED_MODEL_MAX_DIMENSION, boundsFromAsset, boundsHeight, boundsMaxDimension, boundsSize } from "../SceneGroundingUtils.js";
import { AuraNodeBuilder } from "./builder.js";
import { camera } from "./camera.js";
import { isPositiveFinite, lowerLookNode } from "../sceneMath.js";
import { physics } from "./physics.js";
import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import { timeline } from "./timeline.js";
import { resolveQrFlags } from "../../contracts/flags.js";

const DEFAULT_SCENE_BACKGROUND: AuraColor = "#070b12";

/**
 * A3D_QR_LOOKS (lane 13, #1142 follow-up): a look group carries its
 * horizon-matched backdrop (`looks.preset(id)` -> `aura-look:<id>` group
 * `background`), but only `scene.background` reached the renderer, so every
 * template that left the backdrop to its look rendered the default near-black
 * void (look/solid-void). Flag on, an unset scene background takes the last
 * authored look's backdrop; an explicit `.background()` always wins, and flag
 * off is byte-identical.
 */
function lookBackdrop(nodes: readonly AuraSceneNode[]): AuraColor | undefined {
  let found: AuraColor | undefined;
  for (const raw of nodes) {
    // A v1 `look` node backs onto the same v0 group its lowering produces.
    const node = lowerLookNode(raw)?.[0] ?? raw;
    const group = node as { kind?: string; name?: string; background?: AuraColor };
    if (group.kind === "group" && typeof group.name === "string" && group.name.startsWith("aura-look:") && group.background !== undefined) {
      found = group.background;
    }
  }
  return found;
}

function looksFlagOn(): boolean {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const url = typeof location !== "undefined" ? location.href : undefined;
  return resolveQrFlags({ url, env }).on("A3D_QR_LOOKS");
}

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
  private backgroundColor: AuraColor = DEFAULT_SCENE_BACKGROUND;
  private backgroundExplicit = false;
  private cameraSpec: AuraCameraSpec = camera.orbit();
  private timelineSpec: AuraTimelineSpec | undefined;
  private physicsController: AuraPhysicsWorldController | undefined;
  private diagnosticsEnabled = false;

  background(color: AuraColor): this {
    this.backgroundColor = color;
    this.backgroundExplicit = true;
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
      background: this.backgroundExplicit ? this.backgroundColor : (looksFlagOn() ? lookBackdrop(this.nodes) : undefined) ?? this.backgroundColor,
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
