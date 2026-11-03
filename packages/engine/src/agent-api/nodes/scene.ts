// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraMaterialSpec, AuraSceneBackgroundImage, AuraSceneNode, AuraPhysicsWorldController, AuraCameraSpec, AuraCameraFrameAssetOptions, AuraTimelineSpec, AuraSceneSnapshot } from "./types.js";
import { applyOverrideMaterial, assertAuraOverrideMaterial } from "./overrideMaterial.js";
import { AURA_NORMALIZED_MODEL_MAX_DIMENSION, boundsFromAsset, boundsHeight, boundsMaxDimension, boundsSize } from "../SceneGroundingUtils.js";
import { AuraNodeBuilder, toSceneNode } from "./builder.js";
import { camera } from "./camera.js";
import { applyOrbitInteraction } from "./orbitInteraction.js";
import { isPositiveFinite, lowerLookNode } from "../sceneMath.js";
import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import { timeline } from "./timeline.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import { dropShadowedLookFill } from "../looks/lookFill.js";
import { AuraRuntimeError } from "../../contracts/runtimeError.js";
import { validateClippingGroup } from "@aura3d/rendering";
import { AuraClipGroup, type AuraClipGroupSnapshot, type AuraClipScope } from "./clipping.js";

const DEFAULT_SCENE_BACKGROUND: AuraColor = "#070b12";

// Enumerable symbols follow the engine's object-spread snapshots but are not
// written to JSON. This keeps captured state stable while a mounted scene can
// still observe edits to the controller that produced it.
const LIVE_SCENE_CLIPPING: unique symbol = Symbol("aura3d.liveSceneClipping");
const LIVE_MATERIAL_CLIPPING: unique symbol = Symbol("aura3d.liveMaterialClipping");
interface LiveClippingBinding {
  readonly group: AuraClipGroup;
  readonly snapshot: AuraClipGroupSnapshot;
  readonly fingerprint: string;
}
type SceneWithLiveClipping = AuraSceneSnapshot & { readonly [LIVE_SCENE_CLIPPING]?: LiveClippingBinding };
type MaterialWithLiveClipping = AuraMaterialSpec & { readonly [LIVE_MATERIAL_CLIPPING]?: LiveClippingBinding };

function liveClipping(binding: LiveClippingBinding | undefined, current: AuraClipGroup | AuraClipGroupSnapshot | undefined): AuraClipGroup | AuraClipGroupSnapshot | undefined {
  // A caller can use object spread to replace clipping or directly edit a
  // copied snapshot. In either case the explicit value wins over its old
  // controller; ordinary engine spreads preserve both identity and contents.
  return binding && binding.snapshot === current && binding.fingerprint === JSON.stringify(current) ? binding.group : current;
}

/** Internal rendering seam: JSON-loaded snapshots naturally fall back to their copied state. */
export function getSceneClipping(snapshot: AuraSceneSnapshot): AuraClipGroup | AuraClipGroupSnapshot | undefined {
  return liveClipping((snapshot as SceneWithLiveClipping)[LIVE_SCENE_CLIPPING], snapshot.clipping);
}

/** Internal rendering seam for a copied material in a scene snapshot. */
export function getMaterialClipping(material: AuraMaterialSpec | undefined): AuraClipGroup | AuraClipGroupSnapshot | undefined {
  const value = material && liveClipping((material as MaterialWithLiveClipping)[LIVE_MATERIAL_CLIPPING], material.clipping);
  if (value !== undefined) snapshotClipping(value, "material");
  return value;
}

function snapshotClipping(value: AuraClipGroup | AuraClipGroupSnapshot, scope: AuraClipScope): AuraClipGroupSnapshot {
  if (!value || typeof value !== "object" || value.kind !== "aura-clip-group") {
    throw new TypeError(`Expected a ${scope} clipping group created by clipping.${scope}().`);
  }
  if (value.scope !== scope) throw new RangeError(`Expected a ${scope} clipping group.`);
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.disposed !== "boolean") {
    throw new TypeError("Clipping snapshot requires a nonnegative revision and boolean disposed state.");
  }
  const validated = validateClippingGroup(value, scope);
  return { kind: "aura-clip-group", scope, revision: value.revision, disposed: value.disposed, ...validated };
}

/** Copy only clipping-bearing materials, preserving all unrelated node identity. */
function snapshotMaterial(material: AuraMaterialSpec): AuraMaterialSpec {
  const clipping = getMaterialClipping(material);
  if (clipping === undefined) return material;
  const snapshot = snapshotClipping(clipping, "material");
  const copy: MaterialWithLiveClipping = {
    ...material,
    clipping: snapshot,
    ...(clipping instanceof AuraClipGroup ? { [LIVE_MATERIAL_CLIPPING]: { group: clipping, snapshot, fingerprint: JSON.stringify(snapshot) } } : { [LIVE_MATERIAL_CLIPPING]: undefined })
  };
  return copy;
}

function snapshotNodeMaterials(node: AuraSceneNode): AuraSceneNode {
  if (node.kind === "group") {
    const children = node.children.map(snapshotNodeMaterials);
    return children.some((child, index) => child !== node.children[index]) ? { ...node, children } : node;
  }
  let result: AuraSceneNode = node;
  if ("material" in node && node.material) {
    const material = snapshotMaterial(node.material);
    if (material !== node.material) result = { ...node, material } as AuraSceneNode;
  }
  if (node.kind === "primitive" && node.lod) {
    const levels = node.lod.levels.map((level) => {
      if (!level.material) return level;
      const material = snapshotMaterial(level.material);
      return material === level.material ? level : { ...level, material };
    });
    if (levels.some((level, index) => level !== node.lod!.levels[index])) {
      result = { ...result, lod: { ...node.lod, levels } } as AuraSceneNode;
    }
  }
  return result;
}

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
  private backgroundToneMapped = true;
  // threejs-parity L7/SG-10: `background({ texture | cube })` — three's
  // `scene.background` accepting a texture/cubemap (never enables IBL).
  private backgroundImageSpec: AuraSceneBackgroundImage | undefined;
  private cameraSpec: AuraCameraSpec = camera.orbit();
  private timelineSpec: AuraTimelineSpec | undefined;
  private physicsController: AuraPhysicsWorldController | undefined;
  private diagnosticsEnabled = false;
  private overrideMaterialSpec: AuraMaterialSpec | undefined;
  private clippingGroup: AuraClipGroup | AuraClipGroupSnapshot | undefined;

  /** Attach a scene-wide world-space group, or clear it with `null`. */
  clipping(next: AuraClipGroup | AuraClipGroupSnapshot | null): this {
    if (next === null) {
      this.clippingGroup = undefined;
      return this;
    }
    const copied = snapshotClipping(next, "global");
    // Only a real controller stays live; a plain JSON snapshot is copied on
    // receipt so later caller mutations cannot alter the scene.
    this.clippingGroup = next instanceof AuraClipGroup ? next : copied;
    return this;
  }

  /**
   * threejs-parity SG-10: three's `scene.overrideMaterial`. Every primitive
   * (including instanced and distance-LOD ones), model and `instances.mesh` /
   * `batched.mesh` node renders with `spec` instead of its own material;
   * geometry and per-node transforms are untouched. Pass `null` to restore the
   * authored materials. Lines, points, sprites and procedural character parts
   * keep their own materials. Applies to nodes authored before `toJSON()`/mount
   * (nodes added later at runtime through the app keep their own material).
   */
  overrideMaterial(spec: AuraMaterialSpec | null): this {
    if (spec === null) {
      this.overrideMaterialSpec = undefined;
      return this;
    }
    assertAuraOverrideMaterial(spec);
    snapshotMaterial(spec);
    this.overrideMaterialSpec = spec;
    return this;
  }

  /**
   * PRD-01 C-05 + threejs-parity L7/SG-10: tone-mapped with the scene by
   * default; `{ toneMapped: false }` shows the authored colour exactly.
   *
   * Also accepts `{ texture: urlOrAssetRef }` or `{ cube: { faces } }` —
   * three's `scene.background = Texture | CubeTexture`. The image paints via
   * the renderer's environment-background pass; it does NOT enable IBL.
   */
  background(
    color: AuraColor | AuraSceneBackgroundImage,
    options: { readonly toneMapped?: boolean } = {}
  ): this {
    if (color !== null && typeof color === "object" && ("texture" in color || "cube" in color)) {
      this.backgroundImageSpec = color;
      this.backgroundExplicit = true;
      this.backgroundToneMapped = options.toneMapped !== false;
      return this;
    }
    this.backgroundColor = color as AuraColor;
    this.backgroundImageSpec = undefined;
    this.backgroundExplicit = true;
    this.backgroundToneMapped = options.toneMapped !== false;
    return this;
  }

  add(node: AuraNodeBuilder<AuraSceneNode> | AuraSceneNode): this {
    this.nodes.push(toSceneNode(node));
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
    const clipping = this.clippingGroup;
    const clippingSnapshot = clipping ? snapshotClipping(clipping, "global") : undefined;
    const nodes = dropShadowedLookFill(this.overrideMaterialSpec ? applyOverrideMaterial(this.nodes, this.overrideMaterialSpec) : [...this.nodes]);
    return {
      schema: "aura3d-scene-snapshot/1.0",
      ...(clippingSnapshot ? { clipping: clippingSnapshot } : {}),
      ...(clipping instanceof AuraClipGroup && clippingSnapshot ? { [LIVE_SCENE_CLIPPING]: { group: clipping, snapshot: clippingSnapshot, fingerprint: JSON.stringify(clippingSnapshot) } } : {}),
      background: this.backgroundExplicit ? this.backgroundColor : (looksFlagOn() ? lookBackdrop(this.nodes) : undefined) ?? this.backgroundColor,
      ...(this.backgroundImageSpec ? { backgroundImage: this.backgroundImageSpec } : {}),
      ...(this.backgroundToneMapped ? {} : { backgroundToneMapped: false as const }),
      camera: applyOrbitInteraction(this.cameraSpec, this.nodes),
      timeline: this.timelineSpec,
      physics: this.physicsController?.snapshot(),
      ...(this.overrideMaterialSpec ? { overrideMaterial: snapshotMaterial(this.overrideMaterialSpec) } : {}),
      nodes: nodes.map(snapshotNodeMaterials),
      diagnostics: {
        enabled: this.diagnosticsEnabled
      }
    };
  }

  getPhysicsController(): AuraPhysicsWorldController | undefined {
    return this.physicsController;
  }
}

/** Optional one-shot construction for `scene({ ... })`; every field has a builder method with the same meaning. */
export interface AuraSceneInit {
  readonly children?: readonly (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[];
  readonly background?: AuraColor | AuraSceneBackgroundImage;
  readonly camera?: AuraCameraSpec;
  readonly timeline?: AuraTimelineSpec;
  readonly diagnostics?: boolean;
  /** Scene-wide world-space retained half-spaces. */
  readonly clipping?: AuraClipGroup | AuraClipGroupSnapshot;
}

const SCENE_INIT_KEYS = new Set(["children", "background", "camera", "timeline", "diagnostics", "clipping"]);

export function scene(init?: AuraSceneInit): AuraSceneBuilder {
  const builder = new AuraSceneBuilder();
  if (init === undefined) return builder;
  if (init === null || typeof init !== "object" || Array.isArray(init)) {
    throw new AuraRuntimeError("invalid-scene-options", "scene(init) takes an options object ({ children, background, camera, timeline, diagnostics, clipping }) or nothing. Suggested fix: scene().add(node) for one node, scene({ children: [...] }) for many.");
  }
  // `scene({ children })` used to return a silently empty scene (the argument was ignored); unknown keys now fail by name.
  const unknown = Object.keys(init).filter((key) => !SCENE_INIT_KEYS.has(key));
  if (unknown.length > 0) {
    throw new AuraRuntimeError("invalid-scene-options", `scene(init) does not understand ${unknown.map((key) => `"${key}"`).join(", ")}. Supported: children, background, camera, timeline, diagnostics, clipping.`);
  }
  if (init.children !== undefined) {
    if (!Array.isArray(init.children)) throw new AuraRuntimeError("invalid-scene-options", "scene({ children }) needs an array of nodes.");
    builder.addMany(init.children);
  }
  if (init.background !== undefined) builder.background(init.background);
  if (init.camera !== undefined) builder.camera(init.camera);
  if (init.timeline !== undefined) builder.timeline(init.timeline);
  if (init.diagnostics !== undefined) builder.diagnostics(init.diagnostics);
  if (init.clipping !== undefined) builder.clipping(init.clipping);
  return builder;
}
