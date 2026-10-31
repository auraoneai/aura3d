// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraMaterialSpec, AuraAnimationSpec, AuraRuntimeNodeSpec, AuraInteractionSpec, AuraSceneNode, AuraNodePhysicsSpec } from "./types.js";

/**
 * GU47 E-G phase 2: unwrap a node builder to its plain node. `AuraNodeBuilder`
 * is the common case; `world.*` builders (`AuraWorldNodeBuilder`, which cannot
 * extend this class without an import cycle) carry `toJSON()` and no `kind`.
 * Pushing such a builder as-is left its `name()` method where a node name
 * belongs and the compiler never saw `kind: "water"`.
 */
export function toSceneNode(node: AuraNodeBuilder<AuraSceneNode> | AuraSceneNode): AuraSceneNode {
  if (node instanceof AuraNodeBuilder) return node.toJSON();
  const candidate = node as unknown as { readonly toJSON?: unknown };
  if (typeof candidate.toJSON === "function" && !("kind" in node)) return (candidate.toJSON as () => AuraSceneNode).call(node);
  return node;
}

export class AuraNodeBuilder<TNode extends AuraSceneNode> {
  constructor(private readonly value: TNode) {}

  /** `position(x, y, z)` or `position([x, y, z])` (the array form matches `scale` and the scene option shapes). */
  position(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly position: AuraVec3 }>;
  position(value: AuraVec3): AuraNodeBuilder<TNode & { readonly position: AuraVec3 }>;
  position(x: number | AuraVec3, y?: number, z?: number): AuraNodeBuilder<TNode & { readonly position: AuraVec3 }> {
    const v = typeof x === "number" ? ([x, y as number, z as number] as const) : ([x[0], x[1], x[2]] as const);
    return this.with({ position: v });
  }

  /** `rotate(x, y, z, order?)` or `rotate([x, y, z], order?)`, Euler radians. */
  rotate(x: number, y: number, z: number, order?: import("../../contracts/sceneGraph").AuraEulerOrder): AuraNodeBuilder<TNode & { readonly rotation: AuraVec3; readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder }>;
  rotate(value: AuraVec3, order?: import("../../contracts/sceneGraph").AuraEulerOrder): AuraNodeBuilder<TNode & { readonly rotation: AuraVec3; readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder }>;
  rotate(x: number | AuraVec3, y?: number | import("../../contracts/sceneGraph").AuraEulerOrder, z?: number, order?: import("../../contracts/sceneGraph").AuraEulerOrder): AuraNodeBuilder<TNode & { readonly rotation: AuraVec3; readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder }> {
    const vec = typeof x === "number" ? ([x, y as number, z as number] as const) : ([x[0], x[1], x[2]] as const);
    const eulerOrder = typeof x === "number" ? order : (y as import("../../contracts/sceneGraph").AuraEulerOrder | undefined);
    return this.with(eulerOrder === undefined ? { rotation: vec } : { rotation: vec, rotationOrder: eulerOrder });
  }

  /** C-06 (PR 0a): quaternion rotation; wins over `rotation` in the compiled transform. */
  quaternion(x: number, y: number, z: number, w: number): AuraNodeBuilder<TNode & { readonly quaternion: import("../../contracts/sceneGraph").AuraQuat }> {
    return this.with({ quaternion: [x, y, z, w] as const });
  }

  scale(value: number | AuraVec3): AuraNodeBuilder<TNode & { readonly scale: number | AuraVec3 }> {
    return this.with({ scale: value });
  }

  /** `lookAt(x, y, z)` or `lookAt([x, y, z])`. */
  lookAt(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly lookAt: AuraVec3 }>;
  lookAt(value: AuraVec3): AuraNodeBuilder<TNode & { readonly lookAt: AuraVec3 }>;
  lookAt(x: number | AuraVec3, y?: number, z?: number): AuraNodeBuilder<TNode & { readonly lookAt: AuraVec3 }> {
    const v = typeof x === "number" ? ([x, y as number, z as number] as const) : ([x[0], x[1], x[2]] as const);
    return this.with({ lookAt: v });
  }

  material(material: AuraMaterialSpec): AuraNodeBuilder<TNode & { readonly material: AuraMaterialSpec }> {
    return this.with({ material });
  }

  animate(animation: AuraAnimationSpec): AuraNodeBuilder<TNode & { readonly animation: AuraAnimationSpec }> {
    return this.with({ animation });
  }

  onPointer(interaction: AuraInteractionSpec): AuraNodeBuilder<TNode & { readonly interaction: AuraInteractionSpec }> {
    return this.with({ interaction });
  }

  physics(spec: AuraNodePhysicsSpec): AuraNodeBuilder<TNode & { readonly physics: AuraNodePhysicsSpec }> {
    return this.with({ physics: spec });
  }

  runtime(spec: AuraRuntimeNodeSpec): AuraNodeBuilder<TNode & { readonly runtime: AuraRuntimeNodeSpec }> {
    return this.with({ runtime: { mutable: true, ...spec } });
  }

  toJSON(): TNode {
    return this.value;
  }

  private with<TPatch extends Partial<AuraSceneNode>>(patch: TPatch): AuraNodeBuilder<TNode & TPatch> {
    return new AuraNodeBuilder({ ...this.value, ...patch } as TNode & TPatch);
  }
}
