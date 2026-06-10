/**
 * Computed world-space transform for an ECS entity.
 *
 * Written by {@link TransformSystem} each frame from the entity's
 * {@link TransformComponent} and {@link HierarchyComponent} parent chain.
 * The renderer bridge reads this directly — it never touches local transforms.
 */
export class WorldTransformComponent {
  worldMatrix = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);

  normalMatrix = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}
