export type CameraKind = "perspective" | "orthographic";

/**
 * Camera parameters + computed matrices for an ECS entity.
 *
 * {@link CameraSystem} computes `projectionMatrix`, `viewMatrix`, and
 * `viewProjectionMatrix` each frame from the entity's
 * {@link WorldTransformComponent}.
 */
export class CameraComponent {
  kind: CameraKind = "perspective";

  // Perspective
  fovYRadians = Math.PI / 3;
  aspect = 1;
  near = 0.1;
  far = 1000;

  // Orthographic
  left = -1;
  right = 1;
  bottom = -1;
  top = 1;
  zoom = 1;

  // Computed each frame by CameraSystem
  projectionMatrix = new Float32Array(16);
  viewMatrix = new Float32Array(16);
  viewProjectionMatrix = new Float32Array(16);

  viewport = { x: 0, y: 0, width: 1, height: 1 };
}
