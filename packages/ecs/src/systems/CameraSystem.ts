import { Matrix4 } from "@aura3d/math";
import { type System, type SystemContext } from "../System.js";
import { type World } from "../World.js";
import { CameraComponent } from "../components/CameraComponent.js";
import { WorldTransformComponent } from "../components/WorldTransformComponent.js";

/**
 * Computes camera projection and view matrices for entities that have
 * both {@link CameraComponent} and {@link WorldTransformComponent}.
 *
 * Runs after {@link TransformSystem} so the camera entity's world matrix
 * is already computed.
 */
export class CameraSystem implements System {
  readonly name = "CameraSystem";
  readonly phase = "update";
  readonly priority = -70;
  // Soft ordering constraint: the scheduler skips this edge when
  // TransformSystem is not registered, so CameraSystem can run standalone.
  readonly after = ["TransformSystem"];

  update(world: World, _context: SystemContext): void {
    for (const entity of world
      .query({ include: [CameraComponent, WorldTransformComponent] })
      .toArray()) {
      const cam = world.get(entity, CameraComponent)!;
      const wt = world.get(entity, WorldTransformComponent)!;

      const projection =
        cam.kind === "perspective"
          ? Matrix4.perspective(cam.fovYRadians, cam.aspect, cam.near, cam.far)
          : Matrix4.orthographic(
              cam.left / cam.zoom,
              cam.right / cam.zoom,
              cam.bottom / cam.zoom,
              cam.top / cam.zoom,
              cam.near,
              cam.far
            );

      // viewMatrix = inverse(worldMatrix)
      const worldMat = new Matrix4(wt.worldMatrix as unknown as Matrix4["elements"]);
      const view = worldMat.inverse();

      (cam.projectionMatrix as Float32Array).set(projection.elements);
      (cam.viewMatrix as Float32Array).set(view.elements);
      (cam.viewProjectionMatrix as Float32Array).set(projection.multiply(view).elements);
    }
  }
}
