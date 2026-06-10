import { Matrix4, Quaternion, Vector3 } from "@aura3d/math";
import { type Entity } from "../Entity.js";
import { type System, type SystemContext } from "../System.js";
import { type World } from "../World.js";
import { HierarchyComponent } from "../components/HierarchyComponent.js";
import { TransformComponent } from "../components/TransformComponent.js";
import { WorldTransformComponent } from "../components/WorldTransformComponent.js";

/** Safety cap for defensive parent-chain walks (guards against cycles created by direct `parent` mutation). */
const MAX_HIERARCHY_DEPTH = 4096;

/**
 * Computes {@link WorldTransformComponent} for every entity that has both
 * {@link TransformComponent} and {@link HierarchyComponent}.
 *
 * Entities are processed in depth order (parents before children) so the
 * world matrix cascade is correct in a single pass.
 */
export class TransformSystem implements System {
  readonly name = "TransformSystem";
  readonly phase = "update";
  readonly priority = -80;

  update(world: World, _context: SystemContext): void {
    const entities = world
      .query({ include: [TransformComponent, HierarchyComponent] })
      .toArray()
      .sort((a, b) => effectiveDepth(world, a) - effectiveDepth(world, b));

    for (const entity of entities) {
      const transform = world.get(entity, TransformComponent)!;
      const hierarchy = world.get(entity, HierarchyComponent)!;

      const local = Matrix4.compose(
        new Vector3(...transform.position),
        new Quaternion(...transform.rotation),
        new Vector3(...transform.scale)
      );

      let worldMat: Matrix4;
      if (hierarchy.parent) {
        const parentWtc = world.get(hierarchy.parent, WorldTransformComponent);
        worldMat = parentWtc
          ? new Matrix4(parentWtc.worldMatrix as unknown as Matrix4["elements"]).multiply(local)
          : local;
      } else {
        worldMat = local;
      }

      let wtc = world.get(entity, WorldTransformComponent);
      if (!wtc) {
        wtc = new WorldTransformComponent();
        world.add(entity, WorldTransformComponent, wtc);
      }
      (wtc.worldMatrix as Float32Array).set(worldMat.elements);
      (wtc.normalMatrix as Float32Array).set(computeNormalMatrix(worldMat));
    }
  }
}

/**
 * Returns the depth used for parents-before-children ordering.
 *
 * {@link HierarchyComponent.depth} is maintained by `HierarchySystem.setParent`.
 * If `parent` was set directly (constructor argument or field mutation) the
 * stored depth is stale at 0, so recompute it defensively by walking the
 * parent chain.
 */
function effectiveDepth(world: World, entity: Entity): number {
  const hierarchy = world.get(entity, HierarchyComponent);
  if (!hierarchy) return 0;
  if (hierarchy.depth > 0 || hierarchy.parent === null) return hierarchy.depth;

  let depth = 0;
  let current: Entity | null = hierarchy.parent;
  while (current && depth < MAX_HIERARCHY_DEPTH) {
    depth += 1;
    const parentHierarchy: HierarchyComponent | undefined = world.entities.isAlive(current)
      ? world.get(current, HierarchyComponent)
      : undefined;
    current = parentHierarchy?.parent ?? null;
  }
  return depth;
}

function computeNormalMatrix(worldMat: Matrix4): Float32Array {
  // Normal matrix = inverse-TRANSPOSE of the world matrix, matching the
  // renderer's reference `normalMatrixFromModel` (Renderer.ts):
  // transpose(invert(model)), then extract the upper-left 3x3 into a 4x4
  // with identity in the 4th row/col (column-major layout).
  // Avoid crashing on singular matrices (zero scale) by falling back to identity.
  try {
    const m = worldMat.inverse().transpose().elements;
    return new Float32Array([
      m[0], m[1], m[2], 0,
      m[4], m[5], m[6], 0,
      m[8], m[9], m[10], 0,
      0, 0, 0, 1,
    ]);
  } catch {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }
}
