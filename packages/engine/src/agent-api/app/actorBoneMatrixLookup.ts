import type { SceneNode } from "@aura3d/scene";

/** The slice of an actor's scene graph the bone lookup needs. */
export interface ActorBoneLookupScene {
  traverse(visitor: (node: SceneNode) => void): void;
  updateWorldTransforms(): void;
}

/**
 * The bone→world-matrix lookup behind `handle.animation.socket(bone)` and bone
 * attachments: snapshot the actor's scene nodes by name once, then read the
 * bone's world matrix on each call. Pose writes after the clip (overlay poses,
 * IK, procedural overrides) only dirty local transforms, so the scene's world
 * transforms are refreshed first (dirty-tracked: clean nodes are skipped);
 * otherwise sockets read the clip pose instead of the final pose.
 */
export function createActorBoneMatrixLookup(actor: {
  readonly pipeline: { readonly resources: { readonly scene: ActorBoneLookupScene } };
}): (bone: string) => Float32Array | null {
  const scene = actor.pipeline.resources.scene;
  const nodesByName = new Map<string, SceneNode>();
  scene.traverse((node) => {
    if (node.name && !nodesByName.has(node.name)) nodesByName.set(node.name, node);
  });
  return (bone: string) => {
    const node = nodesByName.get(bone);
    if (!node) return null;
    scene.updateWorldTransforms();
    return Float32Array.from(node.transform.worldMatrix);
  };
}
