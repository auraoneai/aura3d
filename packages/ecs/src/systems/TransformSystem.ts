import { Matrix4, Quaternion, Vector3 } from "@aura3d/math";
import { type System, type SystemContext } from "../System.js";
import { type World } from "../World.js";
import { HierarchyComponent } from "../components/HierarchyComponent.js";
import { TransformComponent } from "../components/TransformComponent.js";
import { WorldTransformComponent } from "../components/WorldTransformComponent.js";

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
      .sort((a, b) => {
        const depthA = world.get(a, HierarchyComponent)?.depth ?? 0;
        const depthB = world.get(b, HierarchyComponent)?.depth ?? 0;
        return depthA - depthB;
      });

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

function computeNormalMatrix(worldMat: Matrix4): Float32Array {
  // Normal matrix = inverse-transpose of the 3x3 upper-left block.
  // Avoid crashing on singular matrices (zero scale) by falling back to identity.
  try {
    const inv = worldMat.inverse();
    const m = inv.elements;
    // Transpose the 3x3 into a 4x4 with identity in the 4th row/col.
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
