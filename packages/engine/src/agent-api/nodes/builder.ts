// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraMaterialSpec, AuraAnimationSpec, AuraRuntimeNodeSpec, AuraInteractionSpec, AuraSceneNode, AuraNodePhysicsSpec } from "./types.js";
import { animation } from "./animation.js";
import { material } from "./material.js";
import { physics } from "./physics.js";

export class AuraNodeBuilder<TNode extends AuraSceneNode> {
  constructor(private readonly value: TNode) {}

  position(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly position: AuraVec3 }> {
    return this.with({ position: [x, y, z] as const });
  }

  rotate(x: number, y: number, z: number, order?: import("../../contracts/sceneGraph").AuraEulerOrder): AuraNodeBuilder<TNode & { readonly rotation: AuraVec3; readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder }> {
    return this.with(order === undefined ? { rotation: [x, y, z] as const } : { rotation: [x, y, z] as const, rotationOrder: order });
  }

  /** C-06 (PR 0a): quaternion rotation; wins over `rotation` in the compiled transform. */
  quaternion(x: number, y: number, z: number, w: number): AuraNodeBuilder<TNode & { readonly quaternion: import("../../contracts/sceneGraph").AuraQuat }> {
    return this.with({ quaternion: [x, y, z, w] as const });
  }

  scale(value: number | AuraVec3): AuraNodeBuilder<TNode & { readonly scale: number | AuraVec3 }> {
    return this.with({ scale: value });
  }

  lookAt(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly lookAt: AuraVec3 }> {
    return this.with({ lookAt: [x, y, z] as const });
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
